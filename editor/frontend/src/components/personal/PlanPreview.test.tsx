import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PlanPreview, type PlannedAction } from './PlanPreview';

const ACTIONS: PlannedAction[] = [
  {
    action_id: 'a1',
    label: '创建整理草稿',
    basis: ['发票A', '截止日期 2026-10-15'],
    risk: 'low',
    risk_label: '低风险',
    changed_files: ['workspace/整理汇总.md'],
    missing_information: [],
    rollback: '删除新建的草稿文件即可撤销。',
  },
  {
    action_id: 'a2',
    label: '对外发送',
    basis: ['无'],
    risk: 'high',
    risk_label: '高风险',
    changed_files: [],
    missing_information: ['收件人邮箱'],
    rollback: '已发送内容无法本地撤销，需要对方删除。',
  },
];

describe('P6.4 PlanPreview', () => {
  it('shows plan first, grouped by basis/risk/files/missing', () => {
    render(<PlanPreview planned_actions={ACTIONS} onConfirm={vi.fn()} completed={false} evidence_links={[]} />);
    expect(screen.getByText('计划做什么')).toBeTruthy();
    expect(screen.getByText('创建整理草稿')).toBeTruthy();
    expect(screen.getAllByText('依据').length).toBeGreaterThan(0);
    expect(screen.getByText('会改变的文件')).toBeTruthy();
    expect(screen.getByText(/workspace\/整理汇总\.md/)).toBeTruthy();
    expect(screen.getByText('需要你补充')).toBeTruthy();
    expect(screen.getByText('收件人邮箱')).toBeTruthy();
  });

  it('shows rollback method for every action', () => {
    render(<PlanPreview planned_actions={ACTIONS} onConfirm={vi.fn()} completed={false} evidence_links={[]} />);
    expect(screen.getByText(/删除新建的草稿文件即可撤销/)).toBeTruthy();
    expect(screen.getByText(/已发送内容无法本地撤销/)).toBeTruthy();
  });

  it('confirms ONE action at a time — the clicked one only', () => {
    const confirm = vi.fn();
    render(<PlanPreview planned_actions={ACTIONS} onConfirm={confirm} completed={false} evidence_links={[]} />);
    const buttons = screen.getAllByRole('button');
    fireEvent.click(buttons[1]);   // 点第二个（对外发送）
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(confirm).toHaveBeenCalledWith('a2');
  });

  it('after completion shows real evidence links with honest verification state', () => {
    render(
      <PlanPreview
        planned_actions={ACTIONS}
        onConfirm={vi.fn()}
        completed
        evidence_links={[
          { label: '整理汇总.md', url: '/workspace/整理汇总.md', verification: 'verified' },
          { label: '发送回执', url: '/receipts/r1', verification: 'unverifiable' },
        ]}
      />,
    );
    expect(screen.getByText('完成情况')).toBeTruthy();
    expect(screen.getByText(/已完成，已核对/)).toBeTruthy();
    expect(screen.getByText(/无法确认是否完成/)).toBeTruthy();
  });

  it('exposes no agent jargon on the user-facing surface', () => {
    const { container } = render(
      <PlanPreview planned_actions={ACTIONS} onConfirm={vi.fn()} completed evidence_links={[]} />,
    );
    const text = container.textContent ?? '';
    for (const jargon of ['envelope', 'orchestrator', 'policy_version', 'trace_id', 'action_id']) {
      expect(text.toLowerCase()).not.toContain(jargon);
    }
  });
});
