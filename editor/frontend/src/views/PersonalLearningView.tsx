/**
 * P7.2 — PersonalLearningView: 展示学习提案（候选规则），让用户看到
 * 「为什么建议这条规则」并能拒绝，而不影响任务本身。
 *
 * 设计约束（P7.2 验收）：
 * - 规则默认 proposed，不直接 active；
 * - 高敏感规则必须人工批准（单独标记）；
 * - 每条提案展示例子、影响范围、反例与风险；
 * - 拒绝只影响提案状态，绝不回写任务/规则（那要 P7.3 版本层）。
 */
import React from 'react';

export interface LearningProposalView {
  proposal_id: string;
  summary: string;
  rule: { when: { field: string }; then: { value: string } };
  examples: string[];
  scope: string[];
  counterexamples: string[];
  risk: string;
  sensitivity: 'normal' | 'sensitive' | 'high';
  status: string;
}

export interface PersonalLearningViewProps {
  proposals: LearningProposalView[];
  onApprove: (proposal_id: string) => void;
  onReject: (proposal_id: string) => void;
}

const SENSITIVITY_TEXT: Record<LearningProposalView['sensitivity'], string> = {
  normal: '普通',
  sensitive: '敏感',
  high: '高敏感',
};

/**
 * 用户能看到「为什么建议这条规则」：把例子、影响范围、反例、风险全部列出。
 * 拒绝只更新提案状态，不触碰任何任务或规则。
 */
export function PersonalLearningView({
  proposals, onApprove, onReject,
}: PersonalLearningViewProps): React.ReactElement {
  return (
    <section aria-label="学习提案">
      <h2>学习提案</h2>
      {proposals.length === 0 && <p>当前没有需要你决定的规则建议。</p>}

      {proposals.map((p) => {
        const isHighSensitivity = p.sensitivity === 'high';
        return (
          <article key={p.proposal_id} className="learning-proposal">
            <h3>{p.summary}</h3>
            <p className="sensitivity-note">
              敏感级别：{SENSITIVITY_TEXT[p.sensitivity]}
              {isHighSensitivity ? '（必须人工批准才会生效）' : ''}
            </p>

            <dl>
              <dt>为什么建议这条规则</dt>
              <dd>{p.risk}</dd>

              <dt>例子</dt>
              <dd>
                <ul>
                  {p.examples.map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              </dd>

              <dt>影响范围</dt>
              <dd>{p.scope.join('、')}</dd>

              <dt>反例（为什么不能过度推广）</dt>
              <dd>{p.counterexamples.join('、')}</dd>
            </dl>

            {p.status === 'proposed' && (
              <div className="proposal-actions">
                <button onClick={() => onApprove(p.proposal_id)}>批准这条规则</button>
                <button onClick={() => onReject(p.proposal_id)}>拒绝（不影响任何任务）</button>
              </div>
            )}
            {p.status === 'approved' && <p className="status-note">已批准，等待回归检查后启用。</p>}
            {p.status === 'rejected' && <p className="status-note">已拒绝，不会应用到任何任务。</p>}
            {p.status === 'applied' && <p className="status-note">已启用。</p>}
            {p.status === 'reverted' && <p className="status-note">已回滚到旧版本。</p>}
          </article>
        );
      })}
    </section>
  );
}