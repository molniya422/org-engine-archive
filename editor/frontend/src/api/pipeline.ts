/**
 * P8.5 — 个人事项管线的前端客户端。
 *
 * 只做三件事：建任务、发起执行、轮询状态。所有判断（能不能执行、
 * 是否完成）都在后端；前端不推断、不美化状态。
 *
 * 状态语义（与 executions 表一致）：
 *   queued → running → verified | failed | blocked | unverifiable
 *   另有 awaiting_confirmation（等用户确认）与 recoverable（结果未知，可重试）
 */
import { request } from './client';

export type ExecutionStatus =
  | 'queued' | 'running' | 'awaiting_confirmation' | 'recoverable'
  | 'interrupted' | 'verified' | 'failed' | 'blocked' | 'unverifiable';

/** 终态：不再变化，可以停止轮询。 */
export const TERMINAL_STATUSES: ExecutionStatus[] = [
  'verified', 'failed', 'blocked', 'unverifiable', 'interrupted',
];

export interface TaskContractWire {
  schema_version: 1;
  id: string;
  goal: string;
  success_criteria: string[];
  allowed_scopes: string[];
  forbidden_actions: string[];
  required_evidence: string[];
  risk_level: 'low' | 'medium' | 'high';
  confirmation_points: Array<{ action_kind: string; description?: string }>;
  status: string;
  version: number;
  created_at: string;
}

export interface PlanWire {
  verdict: string;
  selected_action: string | null;
  reason: string;
  missing_information: string[];
  requires_confirmation: boolean;
}

/** 等待用户确认的动作；只含用户可读内容。 */
export interface PendingActionWire {
  action_id: string | null;
  kind: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface RunResponse {
  plan?: PlanWire;
  execution_id: string;
  status: string;
  trace_id?: string;
  reused?: boolean;
  needs_confirmation?: boolean;
  pending?: PendingActionWire | null;
  error?: string;
  detail?: string;
}

export interface EvidenceWire {
  id: string;
  kind: string;
  locator: string;
  content_hash: string;
  captured_at: string;
  supports: string[];
}

export interface TaskDetailWire {
  task: Record<string, unknown> & { id: string; status: string };
  evidence: EvidenceWire[];
  traces: Array<Record<string, unknown>>;
}

export interface ExecutionDetailWire {
  execution: {
    execution_id: string;
    task_id: string;
    status: ExecutionStatus;
    attempt: number;
    last_error: string | null;
    octop_thread_id: string | null;
    pending?: PendingActionWire | null;
  };
}

/** 生成一个合法的任务合同。前端只填必要字段，其余用安全默认。 */
export function newTaskContract(
  goal: string,
  opts: { workspaceScope?: string; requireConfirmation?: boolean } = {},
): TaskContractWire {
  const id = `task_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  return {
    schema_version: 1,
    id,
    goal,
    success_criteria: ['完成用户交代的事项'],
    allowed_scopes: [opts.workspaceScope ?? 'workspace/'],
    // 高风险动作默认全禁：与 P8.1 onboarding 的「默认禁止四项」一致。
    forbidden_actions: ['external_send', 'delete', 'payment', 'submit'],
    required_evidence: ['file_ref'],
    risk_level: 'low',
    // 用户勾选"执行前先问我"→ 后端会停在 awaiting_confirmation 等确认。
    confirmation_points: opts.requireConfirmation
      ? [{ action_kind: 'create_draft', description: '执行前先问我' }]
      : [],
    status: 'draft',
    version: 1,
    created_at: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
  };
}

export const pipelineApi = {
  createTask: (task: TaskContractWire, evidenceRefs: string[] = []) =>
    request<{ ok: boolean; id: string }>('/api/v1/personal/tasks', {
      method: 'POST',
      body: JSON.stringify({ task, evidence_refs: evidenceRefs }),
    }),

  runTask: (taskId: string) =>
    request<RunResponse>(`/api/v1/personal/tasks/${taskId}/run`, {
      method: 'POST',
      body: JSON.stringify({}),
    }),

  getTask: (taskId: string) =>
    request<TaskDetailWire>(`/api/v1/personal/tasks/${taskId}`),

  getExecution: (executionId: string) =>
    request<ExecutionDetailWire>(`/api/v1/personal/executions/${executionId}`),

  resumeExecution: (executionId: string) =>
    request<{ execution_id: string; status: string }>(
      `/api/v1/personal/executions/${executionId}/resume`,
      { method: 'POST', body: JSON.stringify({}) },
    ),

  /** 用户确认：执行已展示给他的那份计划（不重新规划）。 */
  confirmExecution: (executionId: string) =>
    request<{ execution_id: string; status: string }>(
      `/api/v1/personal/executions/${executionId}/confirm`,
      { method: 'POST', body: JSON.stringify({}) },
    ),

  /** 用户拒绝：终止执行，任务记为已取消。 */
  rejectExecution: (executionId: string) =>
    request<{ execution_id: string; status: string; task_status?: string }>(
      `/api/v1/personal/executions/${executionId}/reject`,
      { method: 'POST', body: JSON.stringify({}) },
    ),
};

/** 把后端错误翻成用户能读懂的一句话。 */
export function describeRunError(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e);
  if (raw.includes('octop_not_configured')) return '还没有连接执行环境，请先在设置里配置。';
  if (raw.includes('not_ready')) return '系统还没准备好，请稍后重试。';
  if (raw.includes('decision_service_unreachable')) return '决策服务暂时不可用，请稍后重试。';
  if (raw.includes('workspace_mismatch')) return '工作区设置与执行目录不一致，请在设置里修正。';
  if (raw.includes('contract_version_conflict')) return '这件事的条件已经变了，请重新提交。';
  return raw;
}
