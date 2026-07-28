import { FastifyInstance } from 'fastify';
import { OrgConfigStore } from './org-config/store';

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
}
