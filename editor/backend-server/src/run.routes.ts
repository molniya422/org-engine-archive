import { FastifyInstance } from 'fastify';
import { RunManager, RunState } from './run-manager/manager';
import { RunPersistence } from './run-manager/persistence';
import { homedir } from 'node:os';
import { join } from 'node:path';

/** Only allow safe org_id characters; reject path-traversal / separator tricks. */
const ORG_ID_RE = /^[A-Za-z0-9_-]+$/;

function isValidOrgId(orgId: string): boolean {
  if (!ORG_ID_RE.test(orgId)) return false;
  if (orgId.includes('..')) return false;
  return true;
}

export function registerRunRoutes(app: FastifyInstance, runManager: RunManager, persistence?: RunPersistence): void {
  app.get('/api/v1/runs', async (req) => {
    const url = new URL(req.url, 'http://localhost');
    const orgId = url.searchParams.get('org_id');
    const limit = parseInt(url.searchParams.get('limit') ?? '10', 10);

    // If no org_id: return current active run (legacy compat)
    if (!orgId) return runManager.current ?? { active: false };

    // Reuse injected persistence (honors ORG_ENGINE_HOME) to list runs for org_id
    const store = persistence ?? new RunPersistence();
    const matches: any[] = [];
    for (const id of await store.list()) {
      const state = await store.load(id);
      if (!state || state.orgId !== orgId) continue;
      matches.push({
        runId: state.runId,
        orgId: state.orgId,
        task: state.task,
        status: state.status,
        createdAt: state.createdAt,
        updatedAt: state.updatedAt,
      });
    }

    matches.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
    return { runs: matches.slice(0, limit) };
  });

  app.post<{ Body: { org_id: string; task: string; config_path?: string; workflow_path?: string } }>('/api/v1/runs', async (req, reply) => {
    const { org_id, task, config_path, workflow_path } = req.body;
    if (!org_id || !task) { reply.code(400); return { error: 'org_id and task required' }; }
    if (!isValidOrgId(org_id)) { reply.code(400); return { error: 'org_id contains invalid characters' }; }
    const home = homedir();
    const defaultConfigPath = join(home, '.org-engine-editor', 'orgs', `${org_id}.yaml`);
    const defaultOutputDir = join(home, '.org-engine-editor', 'runs');
    let runId: string;
    try {
      runId = await runManager.start(org_id, task, config_path || defaultConfigPath, defaultOutputDir, undefined, workflow_path);
    } catch (e: any) {
      reply.code(409); return { error: e.message };
    }
    reply.code(201); return { run_id: runId };
  });
  app.get<{ Params: { id: string } }>('/api/v1/runs/:id', async (req, reply) => {
    const state = runManager.current;
    if (state?.runId === req.params.id) return state;
    // Fall back to persistence for historical runs
    const store = persistence ?? new RunPersistence();
    const loaded = await store.load(req.params.id);
    if (!loaded) { reply.code(404); return { error: 'Run not found' }; }
    return loaded;
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
