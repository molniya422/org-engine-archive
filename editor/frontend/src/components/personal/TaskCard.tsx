/**
 * P8.2 — TaskCard: 首页事项卡。
 *
 * 显示目标、下一步、风险和证据状态；提供「查看依据」（展开 EvidencePanel）
 * 和「撤销」入口。复杂度、内部执行角色不显示在默认视图（P8.2 规则 4）——
 * 调试信息属于高级诊断页（P8.4）。
 */
import React from 'react';
import { EvidencePanel, type EvidenceItem } from './EvidencePanel';

export type TaskCardStatus =
  | 'in_progress'        // 进行中
  | 'awaiting_confirmation' // 待确认
  | 'completed'          // 已完成
  | 'attention';         // 需要关注

export const STATUS_LABELS: Record<TaskCardStatus, string> = {
  in_progress: '进行中',
  awaiting_confirmation: '待确认',
  completed: '已完成',
  attention: '需要关注',
};

export interface TaskCardData {
  task_id: string;
  goal: string;
  /** 分区状态：进行中/待确认/已完成/需要关注 */
  status: TaskCardStatus;
  next_step: string;
  risk: 'low' | 'medium' | 'high';
  evidence_status: 'verified' | 'unverifiable' | 'incomplete' | 'none';
  evidence: EvidenceItem[];
  rollback_hint: string;
}

const RISK_LABELS: Record<TaskCardData['risk'], string> = {
  low: '低风险',
  medium: '中风险',
  high: '高风险',
};

export interface TaskCardProps {
  task: TaskCardData;
  /** 分组状态标签（由首页按分区传入），如「进行中」 */
  statusLabel?: string;
  onRevoke?: (task_id: string) => void;
}

export function TaskCard({ task, statusLabel, onRevoke }: TaskCardProps): React.ReactElement {
  const [showEvidence, setShowEvidence] = React.useState(false);
  const evLabel =
    task.evidence_status === 'verified' ? '证据已核对'
    : task.evidence_status === 'none' ? '还没有证据'
    : task.evidence_status === 'incomplete' ? '还有没做完的部分'
    : '证据无法核对，需要你确认';

  return (
    <article aria-label={`事项：${task.goal}`} className="task-card">
      <header>
        <h3>{task.goal}</h3>
        {statusLabel && <span className="status-badge">{statusLabel}</span>}
      </header>
      <p>下一步：{task.next_step}</p>
      <p>
        风险：{RISK_LABELS[task.risk]}
        <span>　·　{evLabel}</span>
      </p>
      <div className="task-actions">
        <button onClick={() => setShowEvidence((v) => !v)}>
          {showEvidence ? '收起依据' : '查看依据'}
        </button>
        {onRevoke && (
          <button onClick={() => onRevoke(task.task_id)} title={task.rollback_hint}>
            撤销
          </button>
        )}
      </div>
      {showEvidence && <EvidencePanel evidence={task.evidence} />}
      {onRevoke && <p className="rollback-hint">撤销方法：{task.rollback_hint}</p>}
    </article>
  );
}