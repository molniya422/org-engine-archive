import { FastifyInstance } from 'fastify';
import { RunManager, RunState } from './run-manager/manager';
import { RunPersistence } from './run-manager/persistence';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { readFile, stat } from 'node:fs/promises';

export function registerRunRoutes(app: FastifyInstance, runManager: RunManager, persistence?: RunPersistence): void {
  app.get('/api/v1/runs', async (req) => {
    const url = new URL(req.url, 'http://localhost');
    const orgId = url.searchParams.get('org_id');
    const limit = parseInt(url.searchParams.get('limit') ?? '10', 10);

    // If no org_id: return current active run (legacy compat)
    if (!orgId) return runManager.current ?? { active: false };

    // List runs for org_id by scanning ~/.org-engine-editor/runs
    const home = homedir();
    const runsDir = join(home, '.org-engine-editor', 'runs');
    try {
      await stat(runsDir);
    } catch {
      return { runs: [] };
    }

    const { readdir } = await import('node:fs/promises');
    const entries = await readdir(runsDir);
    const matches: any[] = [];
    for (const entry of entries) {
      const statePath = join(runsDir, entry, 'state.json');
      try {
        await stat(statePath);
        const raw = await readFile(statePath, 'utf-8');
        const state = JSON.parse(raw);
        if (state.orgId === orgId) {
          matches.push({
            runId: state.runId,
            orgId: state.orgId,
            task: state.task,
            status: state.status,
            startedAt: state.startedAt,
            endedAt: state.endedAt,
          });
        }
      } catch { /* skip corrupt */ }
    }

    matches.sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0));
    return { runs: matches.slice(0, limit) };
  });

  app.post<{ Body: { org_id: string; task: string; config_path?: string; workflow_path?: string } }>('/api/v1/runs', async (req, reply) => {
    const { org_id, task, config_path, workflow_path } = req.body;
    if (!org_id || !task) { reply.code(400); return { error: 'org_id and task required' }; }
    const home = homedir();
    const defaultConfigPath = join(home, '.org-engine-editor', 'orgs', `${org_id}.yaml`);
    const defaultOutputDir = join(home, '.org-engine-editor', 'runs');
    const runId = await runManager.start(org_id, task, config_path || defaultConfigPath, defaultOutputDir, undefined, workflow_path);
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
