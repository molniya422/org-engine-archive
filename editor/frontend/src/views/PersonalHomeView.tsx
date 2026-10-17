/**
 * P8.2 — PersonalHomeView: 小白用户的首页。
 *
 * 主入口是「我要办一件事」；四个分区展示进行中/待确认/已完成/需要关注。
 * 每张卡能看依据、能撤销。复杂度和内部执行角色不出现在默认视图——用户
 * 从首页能判断下一步，而不是被日志淹没（P8.2 验收）。
 */
import React from 'react';
import { TaskCard, STATUS_LABELS, type TaskCardData } from '../components/personal/TaskCard';

export interface PersonalHomeViewProps {
  tasks: TaskCardData[];
  onRequestTask: () => void;
  onRevoke?: (task_id: string) => void;
  /** P8.4：跳到高级诊断（默认用户流程不依赖它） */
  onOpenDiagnostics?: () => void;
}

const SECTIONS: Array<{ status: keyof typeof STATUS_LABELS; hint: string }> = [
  { status: 'awaiting_confirmation', hint: '等你点头，系统才会继续' },
  { status: 'in_progress', hint: '正在按计划做' },
  { status: 'completed', hint: '有证据说明完成情况' },
  { status: 'attention', hint: '有需要你处理的问题' },
];

export function PersonalHomeView({
  tasks, onRequestTask, onRevoke, onOpenDiagnostics,
}: PersonalHomeViewProps): React.ReactElement {
  return (
    <section aria-label="首页">
      <button className="primary-entry" onClick={onRequestTask}>
        我要办一件事
      </button>

      {tasks.length === 0 && <p>现在没有进行中的事项。点上面的按钮告诉我你想办什么。</p>}

      {SECTIONS.map(({ status, hint }) => {
        const group = tasks.filter((t) => t.status === status);
        if (group.length === 0) return null;
        return (
          <div key={status} aria-label={STATUS_LABELS[status]}>
            <h2>{STATUS_LABELS[status]}（{group.length}）</h2>
            <p className="section-hint">{hint}</p>
            {group.map((t) => (
              <TaskCard key={t.task_id} task={t} statusLabel={STATUS_LABELS[status]} onRevoke={onRevoke} />
            ))}
          </div>
        );
      })}

      {onOpenDiagnostics && (
        <button className="advanced-link" onClick={onOpenDiagnostics}>
          高级诊断（开发者）
        </button>
      )}
    </section>
  );
}