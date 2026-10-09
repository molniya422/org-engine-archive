/**
 * P1.4 frontend types + API client for the personal domain.
 * Field names mirror editor/schema/personal/*.schema.json exactly.
 */
import { request } from './client';

// -- canonical domain types (mirror the JSON Schemas) ------------------------

export type Sensitivity = 'normal' | 'sensitive' | 'high';
export type FactKind = 'identity' | 'schedule' | 'contact' | 'health' | 'finance' | 'work' | 'preference' | 'other';
export type TaskStatus =
  | 'draft' | 'planned' | 'simulated' | 'awaiting_confirmation'
  | 'running' | 'verified' | 'blocked' | 'cancelled';
export type RiskLevel = 'low' | 'medium' | 'high';

export interface UserFact {
  schema_version: 1;
  id: string;
  kind: FactKind;
  value: Record<string, unknown> | string | number | boolean;
  source_refs: string[];
  confidence: number;
  valid_from: string;
  valid_until: string | null;
  sensitivity: Sensitivity;
  status: 'active' | 'expired' | 'revoked';
  created_at: string;
  updated_at: string;
}

export interface UserRule {
  schema_version: 1;
  id: string;
  when: { event: string; scope?: string };
  then: { action: 'require_confirmation' | 'deny' | 'allow' | 'redact_and_confirm'; message?: string };
  priority: number;
  source: 'user_explicit' | 'user_approved_learning';
  status: 'active' | 'paused' | 'revoked';
  version: number;
}

export interface TaskContract {
  schema_version: 1;
  id: string;
  goal: string;
  success_criteria: string[];
  allowed_scopes: string[];
  forbidden_actions: string[];
  required_evidence: string[];
  risk_level: RiskLevel;
  confirmation_points: Array<{ action_kind: string; description?: string }>;
  status: TaskStatus;
  version: number;
  created_at: string;
}

export interface EvidenceRecord {
  schema_version: 1;
  id: string;
  kind: 'file' | 'tool_result' | 'user_statement' | 'execution_receipt' | 'verification';
  locator: string;
  content_hash: string;
  captured_at: string;
  sensitivity: Sensitivity;
  supports: string[];
}

export interface DecisionTrace {
  schema_version: 1;
  id: string;
  task_id: string;
  input_refs: string[];
  candidate_actions: string[];
  selected_action: string | null;
  rejected_reasons: Array<{ action_id: string; reason: string }>;
  policy_version: string;
  rule_refs: string[];
  evidence_refs: string[];
  uncertainty: number;
  requires_confirmation: boolean;
  created_at: string;
}

// -- API client ----------------------------------------------------------------

export const personalApi = {
  listFacts: (status?: string) =>
    request<{ facts: UserFact[] }>(`/api/v1/personal/facts${status ? `?status=${status}` : ''}`),
  createFact: (fact: Omit<UserFact, 'updated_at'>) =>
    request<{ ok: boolean; id: string }>('/api/v1/personal/facts', {
      method: 'POST',
      body: JSON.stringify(fact),
    }),

  listRules: (status?: string) =>
    request<{ rules: UserRule[] }>(`/api/v1/personal/rules${status ? `?status=${status}` : ''}`),
  createRule: (rule: UserRule) =>
    request<{ ok: boolean; id: string }>('/api/v1/personal/rules', {
      method: 'POST',
      body: JSON.stringify(rule),
    }),
  patchRule: (id: string, patch: { status?: string }) =>
    request<{ ok: boolean; id: string; status: string; version: number }>(
      `/api/v1/personal/rules/${id}`,
      { method: 'PATCH', body: JSON.stringify(patch) },
    ),

  listTasks: (status?: string) =>
    request<{ tasks: TaskContract[] }>(`/api/v1/personal/tasks${status ? `?status=${status}` : ''}`),
  createTask: (task: TaskContract, evidenceRefs: string[]) =>
    request<{ ok: boolean; id: string }>('/api/v1/personal/tasks', {
      method: 'POST',
      body: JSON.stringify({ task, evidence_refs: evidenceRefs }),
    }),
  getTask: (id: string) =>
    request<{ task: TaskContract; evidence: EvidenceRecord[]; traces: DecisionTrace[] }>(
      `/api/v1/personal/tasks/${id}`,
    ),

  evidenceChain: (refId: string) =>
    request<{ evidence: EvidenceRecord[]; ref: string }>(
      `/api/v1/personal/evidence?ref=${encodeURIComponent(refId)}`,
    ),

  taskTraces: (taskId: string) =>
    request<{ traces: DecisionTrace[] }>(`/api/v1/personal/traces/${taskId}`),
};
