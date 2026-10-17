import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PersonalTaskView, type MaterialOutcomeView } from './PersonalTaskView';
import type { PlannedAction } from '../components/personal/PlanPreview';

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

const ACTIONS: PlannedAction[] = [
  {
    action_id: 'a1',
    label: '创建整理草稿',
    basis: ['invoice_a.md', '报销单A'],
    risk: 'low',
    risk_label: '低风险',
    changed_files: ['workspace/receipts/整理汇总.md'],
    missing_information: [],
    rollback: '删除新建的草稿文件即可撤销。',
  },
  {
    action_id: 'a2',
    label: '创建到期提醒',
    basis: ['invoice_a.md'],
    risk: 'low',
    risk_label: '低风险',
    changed_files: [],
    missing_information: ['提醒时间'],
    rollback: '在提醒列表里删除即可。',
  },
];

describe('P6.4 PersonalTaskView — plan first', () => {
  it('renders the plan before todos', () => {
    render(<PersonalTaskView outcome={{ ...OUTCOME, plan: { planned_actions: ACTIONS } }} />);
    const planHeading = screen.getByRole('heading', { name: '计划做什么' });
    const todoHeading = screen.getByRole('heading', { name: /待办/ });
    expect(planHeading.compareDocumentPosition(todoHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('confirms one action at a time through onConfirmAction', () => {
    const onConfirmAction = vi.fn();
    render(
      <PersonalTaskView
        outcome={{ ...OUTCOME, plan: { planned_actions: ACTIONS }, onConfirmAction }}
      />,
    );
    const buttons = screen.getAllByRole('button', { name: '确认执行这一步' });
    fireEvent.click(buttons[0]);
    expect(onConfirmAction).toHaveBeenCalledTimes(1);
    expect(onConfirmAction).toHaveBeenCalledWith('a1');
  });

  it('shows real evidence links and honest state after completion', () => {
    render(
      <PersonalTaskView
        outcome={{
          ...OUTCOME,
          plan: { planned_actions: ACTIONS },
          evidence_links: [
            { label: '整理汇总.md', url: '/workspace/整理汇总.md', verification: 'verified' },
          ],
        }}
      />,
    );
    expect(screen.getByText('完成情况')).toBeTruthy();
    expect(screen.getByText(/已完成，已核对/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: '确认执行这一步' })).toBeNull();
  });

  it('does not render a plan section when there are no planned actions', () => {
    render(<PersonalTaskView outcome={{ ...OUTCOME, plan: { planned_actions: [] } }} />);
    expect(screen.queryByRole('heading', { name: '计划做什么' })).toBeNull();
  });
});
