/**
 * PersonalDecisionProtocol — versioned mapping from Octop tool receipts
 * (TrajectoryEvent with kind === "tool") to Org Engine Evidence.
 *
 * Protocol-only module for P0.6 (Octop compatibility spike). Field names
 * mirror the Python twin at engine/personal/protocols/octop.py and MUST stay
 * identical across both implementations.
 *
 * Data sovereignty (plan §2.1, one-way, never bidirectional):
 *   Octop session / tool receipt -> PersonalDecisionProtocol -> Org Engine
 *   Evidence, decision trace, rules and learning live in Org Engine stores.
 *   This module ONLY READS Octop receipts and projects them into Evidence
 *   references. It NEVER writes back to Octop's database.
 *
 * Out of scope in this module (implemented in P3/P4/P5):
 *   ToolExecutor, RuleEngine, Verifier, action approval, trace persistence.
 */

import { createHash } from 'node:crypto';

export const PROTOCOL_VERSION = '1.0.0';

/**
 * Thrown when a raw Octop trajectory event cannot be mapped to a receipt.
 * Structural violations (wrong type, missing event_id/thread_id/agent_id/
 * seq/ts, kind !== "tool", payload not an object) raise this so callers can
 * quarantine bad receipts rather than silently drop them.
 */
export class ProtocolMappingError extends Error {
  constructor(message: string) {
    super(`PersonalDecisionProtocol: ${message}`);
    this.name = 'ProtocolMappingError';
  }
}

/**
 * Raw Octop trajectory event as returned by the REST endpoints
 * (TrajectoryEventOut in src/octop/api/routers/chat/trajectory.py). Field
 * names and types match the Octop dataclass + pydantic model exactly.
 */
export interface OctopTrajectoryEvent {
  event_id: string;
  thread_id: string;
  agent_id: string;
  seq: number;
  ts: number;
  kind: string; // TrajectoryKind literal; we only map kind === "tool"
  turn_id: string | null;
  request_seq: number | null;
  is_error: boolean;
  summary: string;
  payload: Record<string, unknown>;
}

/**
 * A tool receipt is the protocol's projection of an Octop `kind === "tool"`
 * trajectory event. The Octop payload is schema-free (dict[str, Any]); the
 * projector (trajectory/projector.py) conventionally emits {call_id, name,
 * args} for the tool call and {call_id, name, result} for the tool result as
 * two separate tool events sharing a call_id. This projection collapses both
 * shapes into one receipt: `args` and `result` are independently optional.
 */
export interface OctopToolReceipt {
  protocol_version: string; // always PROTOCOL_VERSION at mapping time
  event_id: string;
  thread_id: string;
  agent_id: string;
  seq: number;
  ts: number; // unix epoch seconds (float)
  turn_id: string | null;
  request_seq: number | null;
  is_error: boolean;
  summary: string;
  // payload projection — Octop does not enforce a schema; missing keys are
  // tolerated and normalized to null / "".
  call_id: string | null;
  tool_name: string; // "" when payload has no "name" / "tool_name"
  args: unknown; // payload.args if present, else null
  result: unknown; // payload.result if present, else null
  raw_payload: Record<string, unknown>; // full payload, preserved for audit
}

/**
 * Org Engine Evidence shape (plan §1, the 2026-10-04 personal assistant plan).
 * `kind` is fixed to "tool_result" for this mapping. `supports` is left empty;
 * the RuleEngine / DecisionPolicy populates it when linking evidence to a task
 * or decision. `sensitivity` defaults to "normal"; P5 derives it from tool kind
 * and scope.
 */
export interface PersonalEvidence {
  id: string;
  kind: 'tool_result';
  locator: string;
  content_hash: string; // "sha256:<hex>"
  captured_at: string; // ISO8601 UTC, seconds precision, trailing "Z"
  sensitivity: 'normal' | 'sensitive' | 'high';
  supports: string[];
}

/** True when `event` is structurally a trajectory event with kind === "tool". */
export function isToolReceipt(event: unknown): event is OctopTrajectoryEvent {
  return (
    event !== null &&
    typeof event === 'object' &&
    (event as Record<string, unknown>).kind === 'tool'
  );
}

/**
 * Map a raw Octop trajectory event (kind === "tool") to a ToolReceipt.
 *
 * Tolerance rules:
 *  - payload sub-keys (call_id / name / args / result) are optional; missing
 *    values normalize to null / "".
 *  - is_error coerces to boolean (defaults false).
 *  - summary defaults to "".
 *  - turn_id / request_seq pass through (may be null).
 *
 * Strictness rules (raise ProtocolMappingError):
 *  - input is not a plain object.
 *  - kind is not "tool".
 *  - event_id / thread_id / agent_id missing or not a non-empty string.
 *  - seq / ts missing or not a finite number.
 *  - payload present but not a plain object.
 */
export function toToolReceipt(event: unknown): OctopToolReceipt {
  if (event === null || typeof event !== 'object' || Array.isArray(event)) {
    throw new ProtocolMappingError(
      `expected a trajectory event object, got ${describe(event)}`,
    );
  }
  const e = event as Record<string, unknown>;
  if (e.kind !== 'tool') {
    throw new ProtocolMappingError(
      `only kind="tool" events map to a tool receipt (got kind=${JSON.stringify(e.kind)})`,
    );
  }

  requireNonEmptyString(e, 'event_id');
  requireNonEmptyString(e, 'thread_id');
  requireNonEmptyString(e, 'agent_id');
  requireFiniteNumber(e, 'seq');
  requireFiniteNumber(e, 'ts');

  const payload = e.payload;
  let rawPayload: Record<string, unknown> = {};
  if (payload !== undefined && payload !== null) {
    if (
      typeof payload !== 'object' ||
      Array.isArray(payload) ||
      payload instanceof Date
    ) {
      throw new ProtocolMappingError(
        `payload must be an object when present, got ${describe(payload)}`,
      );
    }
    rawPayload = payload as Record<string, unknown>;
  }

  const callId = optStr(rawPayload.call_id);
  const toolName = optStr(rawPayload.name) ?? optStr(rawPayload.tool_name) ?? '';
  const args = Object.prototype.hasOwnProperty.call(rawPayload, 'args')
    ? (rawPayload.args as unknown)
    : null;
  const result = Object.prototype.hasOwnProperty.call(rawPayload, 'result')
    ? (rawPayload.result as unknown)
    : null;

  return {
    protocol_version: PROTOCOL_VERSION,
    event_id: e.event_id as string,
    thread_id: e.thread_id as string,
    agent_id: e.agent_id as string,
    seq: e.seq as number,
    ts: e.ts as number,
    turn_id: optStr(e.turn_id),
    request_seq:
      typeof e.request_seq === 'number' && Number.isFinite(e.request_seq)
        ? e.request_seq
        : null,
    is_error: e.is_error === true,
    summary: optStr(e.summary) ?? '',
    call_id: callId,
    tool_name: toolName,
    args,
    result,
    raw_payload: rawPayload,
  };
}

/**
 * Map a ToolReceipt to Org Engine Evidence. Produces a stable, idempotent
 * evidence record: re-ingesting the same Octop event yields the same id and
 * content_hash, so the evidence store can dedupe on (id, content_hash).
 */
export function toPersonalEvidence(receipt: OctopToolReceipt): PersonalEvidence {
  return {
    id: `evidence_octop_${receipt.event_id}`,
    kind: 'tool_result',
    locator: `octop://trajectory/${receipt.agent_id}/${receipt.thread_id}/${receipt.event_id}`,
    content_hash: contentHash(receipt),
    captured_at: isoFromEpochSeconds(receipt.ts),
    sensitivity: 'normal',
    supports: [],
  };
}

/** True when the receipt marks the tool execution as errored. */
export function isError(receipt: OctopToolReceipt): boolean {
  return receipt.is_error;
}

/** Return the Octop tool name for a receipt ("" when unknown). */
export function toolName(receipt: OctopToolReceipt): string {
  return receipt.tool_name;
}

/** Return the protocol version this module implements. */
export function protocolVersion(): string {
  return PROTOCOL_VERSION;
}

// ---------------------------------------------------------------------------
// internals
// ---------------------------------------------------------------------------

function contentHash(receipt: OctopToolReceipt): string {
  // 注意：这里用 UTF-16 排序 + 默认分隔符，与 canonical-json.ts 的码点排序不同。
  // 当前证据哈希不参与跨语言校验，因此暂不统一；若未来要让证据哈希跨语言可比，
  // 必须迁移到 canonicalJson。
  const canonical = stableStringify({
    event_id: receipt.event_id,
    is_error: receipt.is_error,
    tool_name: receipt.tool_name,
    args: receipt.args,
    result: receipt.result,
  });
  return `sha256:${createHash('sha256').update(canonical, 'utf8').digest('hex')}`;
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  if (value !== null && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    return `{${keys
      .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function isoFromEpochSeconds(ts: number): string {
  // Seconds precision, trailing "Z" — matches the Python twin which uses
  // isoformat(timespec="seconds").replace("+00:00", "Z").
  return new Date(ts * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function describe(v: unknown): string {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  return typeof v;
}

function requireNonEmptyString(
  obj: Record<string, unknown>,
  key: string,
): void {
  const v = obj[key];
  if (typeof v !== 'string' || v.length === 0) {
    throw new ProtocolMappingError(
      `${key} must be a non-empty string, got ${describe(v)}`,
    );
  }
}

function requireFiniteNumber(
  obj: Record<string, unknown>,
  key: string,
): void {
  const v = obj[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new ProtocolMappingError(
      `${key} must be a finite number, got ${describe(v)}`,
    );
  }
}

function optStr(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}
