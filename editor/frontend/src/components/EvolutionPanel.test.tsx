import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { EvolutionPanel } from './EvolutionPanel';

const PROPOSAL = {
  id: 'prop-1', org_ref: 'default-org', rule: 'dispatch_review',
  rationale: 'QA 需要独立评审', status: 'proposed',
  evidence: [{}, {}, {}], changes: [],
};

const APPLIED = { ...PROPOSAL, status: 'applied', applied_commit: 'abc1234' };

// Stateful mock: mimics the real backend, which persists status to the
// proposal file — so a re-fetch after approve returns the applied proposal.
function mockFetch(overrides: { events?: unknown[]; proposals?: unknown[] } = {}) {
  let proposals = overrides.proposals ?? [PROPOSAL];
  return vi.fn((url: string) => {
    const u = String(url);
    if (u.endsWith('/api/learning/events')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(overrides.events ?? []) });
    }
    if (u.endsWith('/api/learning/proposals')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(proposals) });
    }
    if (u.includes('/approve')) {
      proposals = proposals.map((p: any) => ({ ...p, status: 'applied', applied_commit: 'abc1234' }));
      return Promise.resolve({ ok: true, json: () => Promise.resolve(APPLIED) });
    }
    if (u.includes('/reject')) {
      proposals = proposals.map((p: any) => ({ ...p, status: 'rejected' }));
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ ...PROPOSAL, status: 'rejected' }) });
    }
    if (u.includes('/revert')) {
      proposals = proposals.map((p: any) => ({ ...p, status: 'reverted', reverted_commit: 'def5678' }));
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ ...proposals[0], status: 'reverted', reverted_commit: 'def5678' }) });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
  });
}

describe('EvolutionPanel', () => {
  beforeEach(() => { global.fetch = mockFetch() as any; });
  afterEach(() => { vi.restoreAllMocks(); });

  it('renders the panel with proposals', async () => {
    render(<EvolutionPanel />);
    expect(screen.getByLabelText('进化面板')).toBeTruthy();
    await waitFor(() => expect(screen.getByText('dispatch_review')).toBeTruthy());
    expect(screen.getByText('证据 3 条')).toBeTruthy();
    expect(screen.getByText('批准')).toBeTruthy();
    expect(screen.getByText('拒绝')).toBeTruthy();
  });

  it('shows learning event count', async () => {
    global.fetch = mockFetch({
      events: [
        { ts: '2026-09-11T00:00:00+00:00', run_id: 'r', kind: 'skill_miss', payload: {} },
        { ts: '2026-09-11T00:00:01+00:00', run_id: 'r', kind: 'dispatch_miss', payload: {} },
      ],
    }) as any;
    render(<EvolutionPanel />);
    await waitFor(() => expect(screen.getByText(/学习事件（2）/)).toBeTruthy());
  });

  it('approve calls the endpoint and shows the applied commit', async () => {
    render(<EvolutionPanel />);
    await waitFor(() => screen.getByText('批准'));
    fireEvent.click(screen.getByText('批准'));
    await waitFor(() => expect(screen.getByText(/已应用 commit abc1234/)).toBeTruthy());
  });

  it('shows empty state when there are no proposals', async () => {
    global.fetch = mockFetch({ proposals: [] }) as any;
    render(<EvolutionPanel />);
    await waitFor(() => expect(screen.getByText('暂无提案')).toBeTruthy());
  });

  it('revert flips an applied proposal to reverted', async () => {
    render(<EvolutionPanel />);
    await waitFor(() => screen.getByText('批准'));
    fireEvent.click(screen.getByText('批准'));
    await waitFor(() => screen.getByText(/已应用 commit abc1234/));
    fireEvent.click(screen.getByText('回滚'));
    await waitFor(() => expect(screen.getByText(/已回滚/)).toBeTruthy());
  });
});