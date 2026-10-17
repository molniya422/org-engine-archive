/**
 * P8.3 — PersonalMemoryView: 记忆页。
 *
 * 系统记住了什么，逐条可见；每条支持修改、删除，全部支持导出。
 * 记忆项必须带来源（依据），没有来源的记忆不会显示为「已记住」。
 */
import React from 'react';

export interface MemoryItemView {
  fact_id: string;
  content: string;            // 用户语言的一句话，如「每周五健身房」
  source: string;             // 如「你在 10 月 4 日告诉我的」
  sensitivity: 'normal' | 'sensitive' | 'high';
}

export interface PersonalMemoryViewProps {
  memories: MemoryItemView[];
  onUpdate?: (fact_id: string, content: string) => void;
  onDelete?: (fact_id: string) => void;
  onExport?: () => void;
}

export function PersonalMemoryView({
  memories, onUpdate, onDelete, onExport,
}: PersonalMemoryViewProps): React.ReactElement {
  const [editing, setEditing] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState('');

  return (
    <section aria-label="记忆">
      <h2>系统记住了什么</h2>
      <p>这些是系统对你的全部记忆，随时能改、能删、能导出带走。</p>

      {memories.length === 0 && <p>系统还没有记住任何东西。</p>}

      <ul>
        {memories.map((m) => (
          <li key={m.fact_id} aria-label={`记忆：${m.content}`}>
            {editing === m.fact_id ? (
              <span>
                <input
                  aria-label="修改记忆"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                />
                <button
                  onClick={() => {
                    if (draft.trim()) onUpdate?.(m.fact_id, draft.trim());
                    setEditing(null);
                  }}
                >
                  保存修改
                </button>
                <button onClick={() => setEditing(null)}>取消</button>
              </span>
            ) : (
              <span>
                {m.content}
                <span className="memory-source">（来源：{m.source}）</span>
              </span>
            )}
            {onUpdate && editing !== m.fact_id && (
              <button
                onClick={() => {
                  setEditing(m.fact_id);
                  setDraft(m.content);
                }}
              >
                修改
              </button>
            )}
            {onDelete && <button onClick={() => onDelete(m.fact_id)}>删除</button>}
          </li>
        ))}
      </ul>

      {onExport && (
        <button onClick={onExport}>导出全部记忆</button>
      )}
    </section>
  );
}