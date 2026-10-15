/**
 * P6.3 (TS side) — personal eval runner HTTP surface.
 *
 * POST /api/v1/personal/eval/run evaluates a candidate version against the
 * personal regression set (must_ask / must_not_do / must_cite /
 * acceptable_actions). If it fails, the version must not be marked ready —
 * the response carries `ready:false` so upstream can refuse auto-enable.
 *
 * The eval engine lives in engine/personal/eval_runner.py (Python); this
 * route forwards to an injected executor.
 */
import { FastifyInstance } from 'fastify';

export interface EvalCaseWire {
  id: string;
  input: Record<string, unknown>;
  expected_behavior: Record<string, unknown>;
  sensitivity?: string;
  enabled?: boolean;
}

export interface EvalOutcomeWire {
  case_id: string;
  asked?: string[];
  actions?: Array<{ kind: string }>;
  evidence_cited?: string[];
  violations?: string[];
}

export interface EvalExecutor {
  run(cases: EvalCaseWire[], outcomes: EvalOutcomeWire[]): Promise<Record<string, unknown>>;
}

export function registerEvalRoutes(app: FastifyInstance, exec: EvalExecutor): void {
  app.post<{ Body: { cases?: EvalCaseWire[]; outcomes?: EvalOutcomeWire[] } }>(
    '/api/v1/personal/eval/run',
    async (req, reply) => {
      const { cases, outcomes } = req.body ?? {};
      if (!Array.isArray(cases)) {
        reply.code(400);
        return { error: 'cases array required' };
      }
      const report = await exec.run(cases, outcomes ?? []);
      // The gate lives here, not in the caller: ready must be provable.
      if (!report['ready']) {
        reply.code(200);
        return { report, auto_enabled: false, note: 'version blocked — not marked ready' };
      }
      return { report, auto_enabled: true };
    },
  );
}
