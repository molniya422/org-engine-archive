import { FastifyInstance } from 'fastify';
import { WorkflowConfigStore } from './workflow-config/store';
import { readWorkflowConfigRaw } from './workflow-config/yaml-io';

export function registerWorkflowRoutes(app: FastifyInstance, store: WorkflowConfigStore): void {
  app.get('/api/v1/workflows', async () => store.list());
  app.get<{ Params: { id: string } }>('/api/v1/workflows/:id', async (req) => store.get(req.params.id));
  app.put<{ Params: { id: string } }>('/api/v1/workflows/:id', async (req, reply) => {
    try {
      store.save(req.params.id, req.body);
      return { ok: true };
    } catch (e: any) {
      reply.code(400);
      return { error: e.message };
    }
  });
  app.delete<{ Params: { id: string } }>('/api/v1/workflows/:id', async (req) => {
    store.delete(req.params.id);
    return { ok: true };
  });
  app.post<{ Params: { id: string } }>('/api/v1/workflows/:id/validate', async (req, reply) => {
    try {
      return store.validate(req.body);
    } catch (e: any) {
      reply.code(400);
      return { error: e.message };
    }
  });

  // Export workflow config as YAML or JSON (for download / deployment)
  app.get<{ Params: { id: string }; Querystring: { format?: string } }>(
    '/api/v1/workflows/:id/export',
    async (req, reply) => {
      const { id } = req.params;
      const raw = readWorkflowConfigRaw(id);
      if (!raw) {
        reply.code(404);
        return { error: 'Workflow not found' };
      }
      if (req.query.format === 'json') {
        reply.header('Content-Type', 'application/json; charset=utf-8');
        return JSON.stringify(store.get(id), null, 2);
      }
      // Default: return raw YAML text
      reply.header('Content-Type', 'text/yaml; charset=utf-8');
      reply.header('Content-Disposition', `attachment; filename="${id}.yaml"`);
      return raw;
    },
  );
}
