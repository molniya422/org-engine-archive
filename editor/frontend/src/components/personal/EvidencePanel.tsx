/**
 * P8.2 — EvidencePanel: 用真实证据回答「凭什么说做完了」。
 *
 * 每条证据显示名称、来源和核对状态；没有证据就直说没有，不笼统宣称完成。
 * 用户语言，无内部术语（P4.3 契约）。
 */
import React from 'react';

export interface EvidenceItem {
  label: string;
  source: string;
  verification: 'verified' | 'unverifiable' | 'incomplete';
}

const VERIFICATION_TEXT: Record<EvidenceItem['verification'], string> = {
  verified: '已核对',
  unverifiable: '无法核对，需要你确认',
  incomplete: '还没完成',
};

export function EvidencePanel({ evidence }: { evidence: EvidenceItem[] }): React.ReactElement {
  if (evidence.length === 0) {
    return (
      <div className="evidence-panel" aria-label="依据">
        <p>还没有任何证据，这件事的状态未知。</p>
      </div>
    );
  }
  return (
    <div className="evidence-panel" aria-label="依据">
      <h4>依据（{evidence.length} 条）</h4>
      <ul>
        {evidence.map((e, i) => (
          <li key={i}>
            {e.label} <span className="source">（来源：{e.source}）</span>
            <span>——{VERIFICATION_TEXT[e.verification]}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}