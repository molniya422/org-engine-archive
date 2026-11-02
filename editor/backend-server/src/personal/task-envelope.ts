/**
 * P4.1 (TS side) — TaskEnvelope bridge types.
 *
 * Mirror of engine/personal/envelopes.py. The TS backend builds TaskEnvelopes
 * (task contract + redacted state + evidence refs + budget only) and consumes
 * Plan/Execution/Verification envelopes. Python NEVER writes SQLite — this
 * side owns persistence.
 *
 * contract_version bumps when the user changes conditions; a version change
 * re-enters the decision flow and historical execution events from other
 * versions are never completion evidence for a new contract.
 */

export type NetworkMode = 'deny' | 'ask' | 'allow';
export type QueryDataClass = 'public_only' | 'redacted_local' | 'private_forbidden';

/**
 * 联网策略（镜像 engine/personal/envelopes.py 的 NetworkPolicy）。
 * 默认关闭：新任务不显式开启就永不联网；旧任务缺字段也按 deny 处理。
 */
export interface NetworkPolicy {
  enabled: boolean;
  mode: NetworkMode;
  providers: string[];
  allowed_domains: string[];
  query_data_class: QueryDataClass;
  max_results: number;
  recency: string | null;
}

export const DEFAULT_NETWORK_POLICY: NetworkPolicy = {
  enabled: false,
  mode: 'deny',
  providers: [],
  allowed_domains: [],
  query_data_class: 'public_only',
  max_results: 5,
  recency: null,
};

export interface TaskEnvelope {
  contract_version: number;
  policy_version: string;
  trace_id: string;
  task_id: string;
  intent_id: string;
  conversation_id: string;
  goal: string;
  redacted_state: Record<string, unknown>;
  evidence_refs: string[];
  budget: Record<string, unknown>;
  allowed_scopes: string[];
  forbidden_actions: string[];
  /** 合同里用户声明的确认点；非空即要求执行前先确认。 */
  confirmation_points: Array<{ action_kind?: string; description?: string }>;
  network_policy: NetworkPolicy;
}

export const REQUIRED_TASK_FIELDS = [
  'contract_version', 'policy_version', 'trace_id', 'task_id',
  'intent_id', 'conversation_id', 'goal', 'redacted_state',
  'evidence_refs', 'budget',
] as const;

export function buildTaskEnvelope(d: Record<string, unknown>): TaskEnvelope {
  const missing = REQUIRED_TASK_FIELDS.filter((k) => !(k in d));
  if (missing.length > 0) throw new Error(`TaskEnvelope missing required fields: ${missing}`);
  return {
    contract_version: Number(d.contract_version),
    policy_version: String(d.policy_version),
    trace_id: String(d.trace_id),
    task_id: String(d.task_id),
    intent_id: String(d.intent_id),
    conversation_id: String(d.conversation_id),
    goal: String(d.goal),
    redacted_state: (d.redacted_state ?? {}) as Record<string, unknown>,
    evidence_refs: (d.evidence_refs ?? []) as string[],
    budget: (d.budget ?? {}) as Record<string, unknown>,
    allowed_scopes: (d.allowed_scopes ?? []) as string[],
    forbidden_actions: (d.forbidden_actions ?? []) as string[],
    confirmation_points: Array.isArray(d.confirmation_points)
      ? d.confirmation_points as Array<{ action_kind?: string; description?: string }>
      : [],
    network_policy: normalizeNetworkPolicy(d.network_policy),
  };
}

/** 缺省 → 默认拒绝；未知 mode/data_class 抛错，绝不静默放开。 */
export function normalizeNetworkPolicy(raw: unknown): NetworkPolicy {
  if (raw === undefined || raw === null) return { ...DEFAULT_NETWORK_POLICY };
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('network_policy must be an object');
  }
  const r = raw as Record<string, unknown>;
  const mode = (r.mode ?? 'deny') as NetworkMode;
  if (!['deny', 'ask', 'allow'].includes(mode)) {
    throw new Error(`network_policy.mode invalid: ${String(mode)}`);
  }
  const dataClass = (r.query_data_class ?? 'public_only') as QueryDataClass;
  if (!['public_only', 'redacted_local', 'private_forbidden'].includes(dataClass)) {
    throw new Error(`network_policy.query_data_class invalid: ${String(dataClass)}`);
  }
  const providers = r.providers ?? [];
  const domains = r.allowed_domains ?? [];
  if (!Array.isArray(providers) || !providers.every((p) => typeof p === 'string')) {
    throw new Error('network_policy.providers must be a list of strings');
  }
  if (!Array.isArray(domains) || !domains.every((p) => typeof p === 'string')) {
    throw new Error('network_policy.allowed_domains must be a list of strings');
  }
  const maxResults = Number(r.max_results ?? 5);
  if (!Number.isInteger(maxResults) || maxResults < 1 || maxResults > 50) {
    throw new Error('network_policy.max_results must be an integer in 1..50');
  }
  return {
    enabled: r.enabled === true,
    mode,
    providers: providers as string[],
    allowed_domains: domains as string[],
    query_data_class: dataClass,
    max_results: maxResults,
    recency: (r.recency ?? null) as string | null,
  };
}

export interface PlanEnvelope {
  trace_id: string;
  task_id: string;
  contract_version: number;
  policy_version: string;
  candidates: Array<Record<string, unknown>>;
  verdict: string;
  selected_action: string | null;
  reason: string;
  missing_information: string[];
  rule_refs: string[];
  requires_confirmation: boolean;
  network_policy: NetworkPolicy;
}

export interface ExecutionEvent {
  trace_id: string;
  task_id: string;
  seq: number;
  event_type: 'action_started' | 'action_completed' | 'action_failed' | 'waiting_confirmation' | 'contract_version_mismatch';
  payload: Record<string, unknown>;
}

export type VerificationStatus = 'verified' | 'failed' | 'incomplete' | 'unverifiable';

export interface VerificationEnvelope {
  trace_id: string;
  task_id: string;
  contract_version: number;
  status: VerificationStatus;
  checks: Array<Record<string, unknown>>;
  reason: string;
}

export function bumpContractVersion(current: number): number {
  // 用户修改条件 → 合同版本 +1 → 受影响计划重新进入判断流程。
  return current + 1;
}

/** Historical execution events from other contract versions are NOT
 *  completion evidence for the new contract. */
export function isEvidenceForContract(ev: ExecutionEvent, contractVersion: number): boolean {
  return ev.payload['contract_version'] === contractVersion;
}
