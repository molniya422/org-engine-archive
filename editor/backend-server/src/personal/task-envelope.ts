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
