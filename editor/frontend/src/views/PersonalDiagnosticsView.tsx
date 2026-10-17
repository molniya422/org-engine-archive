/**
 * P8.4 — PersonalDiagnosticsView: 高级诊断页（仅高级模式可达）。
 *
 * 开发者能力保留：显示 trace id、policy version 和原始 evidence refs——
 * 这些内容永远不出现在默认个人模式里（P8.2/P8.4 边界）。从事项页
 * 「高级诊断」入口跳转过来，按任务定位需要排查的 trace。
 */
import React from 'react';

export interface DiagnosticTraceView {
  trace_id: string;
  task_id: string;
  policy_version: string;
  decision: string;               // 选了什么、为什么（一句话）
  raw_evidence_refs: string[];    // 原始 evidence_* 引用，不和谐化
  rule_refs: string[];
}

export function PersonalDiagnosticsView({
  traces,
}: { traces: DiagnosticTraceView[] }): React.ReactElement {
  return (
    <section aria-label="高级诊断">
      <h2>高级诊断</h2>
      <p>这一页是给开发者排查用的：原始 trace、policy 版本和证据引用都在这里。普通使用不需要打开。</p>

      {traces.length === 0 && <p>这个任务还没有生成 trace。</p>}

      <ul>
        {traces.map((t) => (
          <li key={t.trace_id} aria-label={`trace ${t.trace_id}`}>
            <p>trace_id: {t.trace_id}</p>
            <p>policy_version: {t.policy_version}</p>
            <p>决策：{t.decision}</p>
            <p>raw evidence refs:</p>
            <ul>
              {t.raw_evidence_refs.map((ref) => <li key={ref}>{ref}</li>)}
            </ul>
            <p>rule_refs: {t.rule_refs.length > 0 ? t.rule_refs.join(', ') : '（无）'}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}