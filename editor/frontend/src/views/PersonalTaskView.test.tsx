import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PersonalTaskView, type MaterialOutcomeView } from './PersonalTaskView';

const OUTCOME: MaterialOutcomeView = {
  summary: { total_files: 10, readable: 8, unreadable: 2, with_dates: 4 },
  todos: [
    {
      title: '报销单A', due: '2026-10-15', expired: false,
      source: { file: 'invoice_a.md', lines: [{ line: 3, text: '截止日期：2026-10-15' }] },
    },
    { title: '保险续费', due: '2026-01-01', expired: true, source: { file: 'expired.md', lines: [] } },
  ],
  duplicates: ['invoice_a_copy.md 与 invoice_a.md 内容重复'],
  unresolved: [{ file: 'ambiguous.md', note: '日期表述不明确（如“下个月”），需要你补充具体日期' }],
  reminder_candidates: [{ title: '报销单A', due: '2026-10-15', auto_created: false }],
  draft_path: 'workspace/receipts/整理汇总.md',
};

describe('P5.4 PersonalTaskView', () => {
  it('renders todos with sources and expiry marks', () => {
    render(<PersonalTaskView outcome={OUTCOME} />);
    expect(screen.getAllByText(/报销单A/).length).toBeGreaterThan(0);
    expect(screen.getByText(/已过期/)).toBeTruthy();
    expect(screen.getByText(/来源：invoice_a\.md/)).toBeTruthy();
  });

  it('asks user for missing info without jargon', () => {
    render(<PersonalTaskView outcome={OUTCOME} />);
    expect(screen.getByText(/需要你补充的信息/)).toBeTruthy();
    const text = document.body.textContent ?? '';
    for (const jargon of ['agent', 'orchestrator', 'envelope', 'policy']) {
      expect(text.toLowerCase()).not.toContain(jargon);
    }
  });

  it('states reminder candidates are not auto-created and originals untouched', () => {
    render(<PersonalTaskView outcome={OUTCOME} />);
    expect(screen.getByText(/不会自动创建/)).toBeTruthy();
    expect(screen.getByText(/原文件未修改/)).toBeTruthy();
  });
});
