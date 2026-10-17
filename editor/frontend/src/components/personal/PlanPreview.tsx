/**
 * P6.4 — PlanPreview: 用户无需看日志就能判断「系统准备做什么」和「是否真的做完」。
 *
 * 先显示计划（分组：依据、风险、缺失信息、会改变的文件），一次只确认一个动作，
 * 显示撤销方法；执行完成后再显示真实证据链接。全程用户语言，无内部术语。
 */
import React from 'react';

export interface PlannedAction {
  action_id: string;
  label: string;                     // 用户语言的动作名，如「创建整理草稿」
  basis: string[];                   // 依据（来源）
  risk: 'low' | 'medium' | 'high';
  risk_label: string;                // 「低风险」等
  changed_files: string[];           // 会改变的文件
  missing_information: string[];     // 需要用户补充的
  rollback: string;                  // 撤销方法
}

export interface EvidenceLink {
  label: string;
  url: string;
  verification: 'verified' | 'unverifiable' | 'incomplete';
}

export interface PlanPreviewProps {
  planned_actions: PlannedAction[];
  onConfirm: (action_id: string) => void;
  completed: boolean;
  evidence_links: EvidenceLink[];
}

const VERIFICATION_TEXT: Record<EvidenceLink['verification'], string> = {
  verified: '已完成，已核对',
  unverifiable: '无法确认是否完成',
  incomplete: '还没完成',
};

export function PlanPreview({
  planned_actions, onConfirm, completed, evidence_links,
}: PlanPreviewProps): React.ReactElement {
  return (
    <section aria-label="计划预览">
      <h2>计划做什么</h2>
      {planned_actions.length === 0 && <p>没有可以执行的动作。</p>}

      {planned_actions.map((a) => (
        <article key={a.action_id} className="plan-action">
          <h3>{a.label}</h3>

          <dl>
            <dt>依据</dt>
            <dd>{a.basis.length ? a.basis.join('；') : '（无）'}</dd>

            <dt>风险</dt>
            <dd>{a.risk_label}</dd>

            {a.changed_files.length > 0 && (
              <>
                <dt>会改变的文件</dt>
                <dd>{a.changed_files.join('、')}</dd>
              </>
            )}

            {a.missing_information.length > 0 && (
              <>
                <dt>需要你补充</dt>
                <dd>{a.missing_information.join('、')}</dd>
              </>
            )}

            <dt>撤销方法</dt>
            <dd>{a.rollback}</dd>
          </dl>

          {!completed && (
            <button onClick={() => onConfirm(a.action_id)}>
              确认执行这一步
            </button>
          )}
        </article>
      ))}

      {completed && evidence_links.length > 0 && (
        <>
          <h2>完成情况</h2>
          <ul>
            {evidence_links.map((e) => (
              <li key={e.url}>
                <a href={e.url}>{e.label}</a>
                <span>（{VERIFICATION_TEXT[e.verification]}）</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
