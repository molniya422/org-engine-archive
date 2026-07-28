import { FastifyInstance } from 'fastify';
import { RunManager, RunState } from './run-manager/manager';

export function registerRunRoutes(app: FastifyInstance, runManager: RunManager): void {
  app.post<{ Body: { org_id: string; task: string; config_path?: string } }>('/api/v1/runs', async (req, reply) => {
    const { org_id, task, config_path } = req.body;
    if (!org_id || !task) { reply.code(400); return { error: 'org_id and task required' }; }
    const runId = await runManager.start(org_id, task, config_path || `~/.org-engine-editor/orgs/${org_id}.yaml`, `~/.org-engine-editor/runs`);
    reply.code(201); return { run_id: runId };
  });
  app.get<{ Params: { id: string } }>('/api/v1/runs/:id', async (req, reply) => {
    const state = runManager.current;
    if (state?.runId !== req.params.id) { reply.code(404); return { error: 'Run not found or not active' }; }
    return state;
  });
  app.post<{ Params: { id: string }; Body: { gateway: string; decision: unknown } }>('/api/v1/runs/:id/decision', async (req, reply) => {
    if (runManager.current?.runId !== req.params.id) { reply.code(404); return { error: 'Run not found or not active' }; }
    try { await runManager.submitDecision(req.body.gateway, req.body.decision); return { ok: true }; }
    catch (e: any) { reply.code(400); return { error: e.message }; }
  });
  app.post<{ Params: { id: string } }>('/api/v1/runs/:id/cancel', async (req, reply) => {
    if (runManager.current?.runId !== req.params.id) { reply.code(404); return { error: 'Run not found or not active' }; }
    await runManager.cancel(); return { ok: true };
  });
}
