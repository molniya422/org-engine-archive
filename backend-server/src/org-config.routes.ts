import { FastifyInstance } from 'fastify';
import { OrgConfigStore } from './org-config/store';
import { readOrgConfigRaw } from './org-config/yaml-io';

export function registerOrgRoutes(app: FastifyInstance, store: OrgConfigStore): void {
  app.get('/api/v1/orgs', async () => store.list());
  app.get<{ Params: { id: string } }>('/api/v1/orgs/:id', async (req) => store.get(req.params.id));
  app.put<{ Params: { id: string } }>('/api/v1/orgs/:id', async (req, reply) => {
    try { store.save(req.params.id, req.body); return { ok: true }; }
    catch (e: any) { reply.code(400); return { error: e.message }; }
  });
  app.delete<{ Params: { id: string } }>('/api/v1/orgs/:id', async (req) => { store.delete(req.params.id); return { ok: true }; });
  app.post<{ Params: { id: string } }>('/api/v1/orgs/:id/validate', async (req, reply) => {
    try { return store.validateRaw(req.body); }
    catch (e: any) { reply.code(400); return { error: e.message }; }
  });

  // Export org config as YAML or JSON (for download / deployment)
  app.get<{ Params: { id: string }; Querystring: { format?: string } }>(
    '/api/v1/orgs/:id/export',
    async (req, reply) => {
      const { id } = req.params;
      const format = req.query.format || 'yaml';

      const raw = readOrgConfigRaw(id);
      if (!raw) {
        reply.code(404);
        return { error: 'Organization not found' };
      }

      if (format === 'json') {
        const data = store.get(id);
        reply.header('Content-Type', 'application/json; charset=utf-8');
        return JSON.stringify(data, null, 2);
      }

      // Default: return raw YAML text
      reply.header('Content-Type', 'text/yaml; charset=utf-8');
      reply.header('Content-Disposition', `attachment; filename="${id}.yaml"`);
      return raw;
    },
  );
}
