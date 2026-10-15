import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PersonalEvalView, type EvalReportView } from './PersonalEvalView';

const PASS: EvalReportView = {
  ready: true, ready_state: 'ready', total: 3, failures: 0, pass_rate: 1,
  regressions: [], reason: 'all passed',
};

const FAIL: EvalReportView = {
  ready: false, ready_state: 'not_ready', total: 3, failures: 1, pass_rate: 0.67,
  regressions: [{ case_id: '绝不自动发送', failures: [{ reason: '版本执行了禁止动作 external_send' }] }],
  reason: '1/3 cases failed — version blocked',
};

describe('P6.3 PersonalEvalView', () => {
  it('passing version: tells the user it can be enabled', () => {
    render(<PersonalEvalView report={PASS} />);
    expect(screen.getByText(/通过了你的回归检查/)).toBeTruthy();
  });

  it('failing version: explicitly says it cannot be auto-enabled', () => {
    render(<PersonalEvalView report={FAIL} />);
    expect(screen.getByText(/暂时不能自动启用/)).toBeTruthy();
    expect(screen.getByText(/执行了禁止动作 external_send/)).toBeTruthy();
  });

  it('never exposes agent jargon on the user-facing surface', () => {
    const { container } = render(<PersonalEvalView report={FAIL} />);
    const text = container.textContent ?? '';
    for (const jargon of ['envelope', 'orchestrator', 'policy_error', 'trace_id']) {
      expect(text.toLowerCase()).not.toContain(jargon);
    }
  });
});
