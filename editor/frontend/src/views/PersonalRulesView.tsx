/**
 * P8.3 — PersonalRulesView: 规则页用用户的话表达——
 * 「我希望你总是 / 从不 / 先问我」。
 *
 * 每条规则显示来源和生效范围；来自学习的规则明确标出「待你批准」，
 * 用户能拒绝而不影响任务（与 P7.2 一致）。
 */
import React from 'react';

export type RuleMood = 'always' | 'never' | 'ask_first';

export interface PersonalRuleView {
  rule_id: string;
  mood: RuleMood;
  statement: string;          // 如「先问我：对外发送任何内容」
  source: string;             // 如「你自己设置的」/「从你的使用中学到（待批准）」
  scope: string;              // 如「所有事项」/「仅报销材料」
  status: 'active' | 'proposed' | 'paused';
}

const MOOD_PATTERNS: Record<RuleMood, (s: string) => string> = {
  always: (s) => `我希望你总是：${s}`,
  never: (s) => `我希望你从不：${s}`,
  ask_first: (s) => `我希望你先问我：${s}`,
};

export interface PersonalRulesViewProps {
  rules: PersonalRuleView[];
  onAddRule?: (mood: RuleMood, statement: string) => void;
  onPauseRule?: (rule_id: string) => void;
}

export function PersonalRulesView({
  rules, onAddRule, onPauseRule,
}: PersonalRulesViewProps): React.ReactElement {
  const [mood, setMood] = React.useState<RuleMood>('ask_first');
  const [statement, setStatement] = React.useState('');

  return (
    <section aria-label="规则">
      <h2>你的规则</h2>
      <p>规则就是你对系统说过的要求。系统不会自己加规则；从使用中学到的一定先问你。</p>

      {rules.length === 0 && <p>还没有任何规则。</p>}

      <ul>
        {rules.map((r) => (
          <li key={r.rule_id} aria-label={`规则：${r.statement}`}>
            <p className="rule-statement">{MOOD_PATTERNS[r.mood](r.statement)}</p>
            <p className="rule-meta">
              来源：{r.source}　·　生效范围：{r.scope}
              {r.status === 'proposed' && <span>　·　【待你批准，还没有生效】</span>}
              {r.status === 'paused' && <span>　·　【已暂停】</span>}
            </p>
            {r.status === 'active' && onPauseRule && (
              <button onClick={() => onPauseRule(r.rule_id)}>暂停这条规则</button>
            )}
            {r.status === 'proposed' && (
              <p>批准或拒绝在「学习提案」页进行。</p>
            )}
          </li>
        ))}
      </ul>

      {onAddRule && (
        <form
          aria-label="添加规则"
          onSubmit={(e) => {
            e.preventDefault();
            if (statement.trim()) {
              onAddRule(mood, statement.trim());
              setStatement('');
            }
          }}
        >
          <h3>加一条规则</h3>
          <select aria-label="规则类型" value={mood} onChange={(e) => setMood(e.target.value as RuleMood)}>
            <option value="always">我希望你总是…</option>
            <option value="never">我希望你从不…</option>
            <option value="ask_first">我希望你先问我…</option>
          </select>
          <input
            aria-label="规则内容"
            placeholder="比如：对外发送任何内容"
            value={statement}
            onChange={(e) => setStatement(e.target.value)}
          />
          <button type="submit">保存规则</button>
          <p className="note">保存后立即生效，随时能暂停。</p>
        </form>
      )}
    </section>
  );
}