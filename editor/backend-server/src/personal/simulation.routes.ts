/**
 * P6.1 (TS side) — simulation mode HTTP surface.
 *
 * POST /api/v1/personal/simulate runs a TaskContract's planned actions in an
 * isolated simulated directory: no real files are touched, no network is
 * produced. The response is always `simulated: true` and never reports a
 * real `verified`/`done` state.
 *
 * The actual simulation logic lives in engine/personal/sandbox.py (Python);
 * this route forwards a planned-action bundle to an injected simulation
 * executor and returns its serialized result. The TS side owns HTTP only.
 */
import { FastifyInstance } from 'fastify';

export interface SandboxCallWire {
  tool: string;
  parameters: Record<string, unknown>;
}

export interface SimulateExecutor {
  (contract: Record<string, unknown>, calls: SandboxCallWire[]): Promise<Record<string, unknown>>;
}

export function registerSimulationRoutes(app: FastifyInstance, simulate: SimulateExecutor): void {
  app.post('/api/v1/personal/simulate', async (req, reply) => {
    const body = (req.body ?? {}) as { contract?: Record<string, unknown>; calls?: SandboxCallWire[] };
    if (!body.contract) {
      reply.code(400);
      return { error: 'contract required' };
    }
    const calls = Array.isArray(body.calls) ? body.calls : [];
    try {
      const result = await simulate(body.contract, calls);
      // Guarantee: simulation results are always marked simulated and never
      // carry a real done/verified status, regardless of what the executor did.
      return { ...result, simulated: true, status: 'simulated' };
    } catch (e) {
      reply.code(503);
      return { error: e instanceof Error ? e.message : String(e), simulated: true };
    }
  });
}
