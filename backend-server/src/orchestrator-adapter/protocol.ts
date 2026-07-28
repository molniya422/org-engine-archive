// Requests from Node server to Python subprocess
export interface StartRunRequest {
  jsonrpc: "2.0"; id: number; method: "start_run";
  params: { org_config_path: string; task_description: string; output_dir: string };
}
export interface SubmitDecisionRequest {
  jsonrpc: "2.0"; id: number; method: "submit_decision";
  params: { gateway: string; decision: unknown };
}
export interface CancelRunRequest {
  jsonrpc: "2.0"; id: number; method: "cancel_run";
  params: Record<string, never>;
}
export type OrchestratorRequest = StartRunRequest | SubmitDecisionRequest | CancelRunRequest;

// Events from Python subprocess to Node server
export interface PhaseStartedEvent { type: "phase_started"; layer: string; phase: string }
export interface ExecutorDispatchedEvent { type: "executor_dispatched"; role: string; dept: string; node_id: string }
export interface ExecutorCompletedEvent { type: "executor_completed"; node_id: string; skill_used: string; verdict: string }
export interface AuditPassedEvent { type: "audit_passed"; node_id: string }
export interface AuditFailedEvent { type: "audit_failed"; node_id: string; reason: string }
export interface ProductKeyIssuedEvent { type: "product_key_issued"; node_id: string; product_key: string }
export interface GatewayPromptEvent { type: "gateway_prompt"; gateway: string; context: unknown; question: string }
export interface RunCompletedEvent { type: "run_completed"; status: "success" | "blocked" | "cancelled"; error?: string }

export type OrchestratorEvent =
  | PhaseStartedEvent | ExecutorDispatchedEvent | ExecutorCompletedEvent
  | AuditPassedEvent | AuditFailedEvent | ProductKeyIssuedEvent
  | GatewayPromptEvent | RunCompletedEvent;
