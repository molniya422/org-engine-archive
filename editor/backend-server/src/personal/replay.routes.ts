/**
 * P6.2 (TS side) — replay HTTP surface.
 *
 * Records and replays decision traces: the input envelope, state snapshot,
 * model/policy versions, and tool receipts are captured so a run can be
 * re-executed from any decision node with a deterministic fake provider and
 * compared against another version. High-risk tool calls are never invoked
 * for real during replay — receipts only.
 *
 * The replay engine itself lives in engine/personal/replay.py (Python);
 * this route forwards to an injected replay executor.
 */
import { FastifyInstance } from 'fastify';

export interface ReplayRecordWire {
  trace_id: string;
  input_envelope: Record<string, unknown>;
  state_snapshot: Record<string, unknown>;
  model_version: string;
  policy_version: string;
  tool_receipts: Array<Record<string, unknown>>;
  nodes: Array<{ step: number; event: string; detail: Record<string, unknown> }>;
}

export interface ReplayExecutor {
  replay(record: ReplayRecordWire, fromStep: number): Promise<Array<Record<string, unknown>>>;
  compare(oldR: ReplayRecordWire, newR: ReplayRecordWire): Promise<Record<string, unknown>>;
}

export function registerReplayRoutes(app: FastifyInstance, exec: ReplayExecutor): void {
  app.post<{ Body: { record: ReplayRecordWire; from_step?: number } }>(
    '/api/v1/personal/replay',
    async (req, reply) => {
      const { record, from_step } = req.body ?? ({} as { record: ReplayRecordWire; from_step?: number });
      if (!record?.trace_id) {
        reply.code(400);
        return { error: 'record.trace_id required' };
      }
      try {
        const events = await exec.replay(record, from_step ?? 0);
        return { events, replayed: true };
      } catch (e) {
        reply.code(503);
        return { error: e instanceof Error ? e.message : String(e) };
      }
    },
  );

  app.post<{ Body: { old: ReplayRecordWire; new: ReplayRecordWire } }>(
    '/api/v1/personal/replay/compare',
    async (req, reply) => {
      const { old: oldR, new: newR } = req.body ?? ({} as { old: ReplayRecordWire; new: ReplayRecordWire });
      if (!oldR?.trace_id || !newR?.trace_id) {
        reply.code(400);
        return { error: 'old.trace_id and new.trace_id required' };
      }
      const diffs = await exec.compare(oldR, newR);
      return { diffs };
    },
  );
}
