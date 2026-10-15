/**
 * P6.3 (TS side) — PersonalEvalView: 用户视角展示回归结果。
 *
 * 新用户看到的是「这个版本能不能用」，不是内部术语。失败必须明确显示「暂时
 * 不能启用」，绝不在用户没确认时把失败版本标记为可用。
 */
import React from 'react';

export interface EvalReportView {
  ready: boolean;
  ready_state: 'ready' | 'not_ready';
  total: number;
  failures: number;
  pass_rate: number;
  regressions: Array<{ case_id: string; failures: Array<{ reason: string }> }>;
  reason: string;
}

export function PersonalEvalView({ report }: { report: EvalReportView }): React.ReactElement {
  const { ready, total, failures, regressions, reason } = report;
  return (
    <section aria-label="版本检查结果">
      <h2>版本检查</h2>
      <p>
        {ready
          ? '这个版本通过了你的回归检查，可以启用。'
          : `这个版本有 ${failures} 项没有通过你的检查，暂时不能自动启用。`}
      </p>
      <ul>
        {regressions.map((r) => (
          <li key={r.case_id}>
            {r.case_id}：
            <ul>
              {r.failures.map((f, i) => <li key={i}>{f.reason}</li>)}
            </ul>
          </li>
        ))}
      </ul>
      <p className="detail">共 {total} 项检查，{failures} 项未通过。</p>
      {!ready && <p className="status-note">{reason}</p>}
    </section>
  );
}
