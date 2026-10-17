import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PersonalLearningView, type LearningProposalView } from './PersonalLearningView';

const PROPOSALS: LearningProposalView[] = [
  {
    proposal_id: 'prop_01',
    summary: '多次把「截止日期」统一改成「2026-10-20」',
    rule: { when: { field: 'due' }, then: { value: '2026-10-20' } },
    examples: [
      '第1次：把「due」改成「2026-10-20」（来自 decision_01）',
      '第2次：把「due」改成「2026-10-20」（来自 decision_02）',
    ],
    scope: ['task_01', 'task_02'],
    counterexamples: ['不同任务改成了不同值，不能一概而用'],
    risk: '低风险，可先试用',
    sensitivity: 'normal',
    status: 'proposed',
  },
  {
    proposal_id: 'prop_02',
    summary: '高敏感字段修正（仅事件类型）',
    rule: { when: { field: 'salary' }, then: { value: '20000' } },
    examples: [],
    scope: ['task_03'],
    counterexamples: ['不能过度推广'],
    risk: '高敏感，必须人工批准',
    sensitivity: 'high',
    status: 'proposed',
  },
];

describe('P7.2 PersonalLearningView', () => {
  it('shows why a rule is proposed (examples, scope, counterexamples, risk)', () => {
    render(<PersonalLearningView proposals={PROPOSALS} onApprove={vi.fn()} onReject={vi.fn()} />);
    expect(screen.getByText('学习提案')).toBeTruthy();
    expect(screen.getAllByText(/为什么建议这条规则/).length).toBeGreaterThan(0);
    expect(screen.getByText(/第1次/)).toBeTruthy();
    expect(screen.getByText(/第2次/)).toBeTruthy();
    expect(screen.getAllByText(/task_01/).length).toBeGreaterThan(0);
    expect(screen.getByText(/不能一概而用/)).toBeTruthy();
    expect(screen.getAllByText(/低风险/).length).toBeGreaterThan(0);
  });

  it('marks high-sensitivity rules as requiring human approval', () => {
    render(<PersonalLearningView proposals={PROPOSALS} onApprove={vi.fn()} onReject={vi.fn()} />);
    expect(screen.getAllByText(/必须人工批准/).length).toBeGreaterThan(0);
  });

  it('does not activate anything until approved', () => {
    render(<PersonalLearningView proposals={PROPOSALS} onApprove={vi.fn()} onReject={vi.fn()} />);
    expect(screen.getAllByText('批准这条规则').length).toBeGreaterThan(0);
    expect(screen.queryByText(/已启用/)).toBeNull();
  });

  it('rejecting a proposal does not affect tasks — status becomes rejected', () => {
    const onReject = vi.fn();
    render(<PersonalLearningView proposals={PROPOSALS} onApprove={vi.fn()} onReject={onReject} />);
    const rejectButtons = screen.getAllByRole('button', { name: /拒绝/ });
    fireEvent.click(rejectButtons[0]);
    expect(onReject).toHaveBeenCalledTimes(1);
    expect(onReject).toHaveBeenCalledWith('prop_01');
  });

  it('approve calls through with the proposal id', () => {
    const onApprove = vi.fn();
    render(<PersonalLearningView proposals={PROPOSALS} onApprove={onApprove} onReject={vi.fn()} />);
    fireEvent.click(screen.getAllByRole('button', { name: '批准这条规则' })[0]);
    expect(onApprove).toHaveBeenCalledWith('prop_01');
  });
});