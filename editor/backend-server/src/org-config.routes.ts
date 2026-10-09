import { FastifyInstance } from 'fastify';
import { OrgConfigStore } from './org-config/store';
import { readOrgConfigRaw } from './org-config/yaml-io';

/**
 * Build a Content-Disposition value that is safe for both ASCII and non-ASCII
 * org ids. Node throws ERR_INVALID_CHAR when a raw non-ASCII byte lands in a
 * header, so non-ASCII names use RFC 5987 `filename*=UTF-8''<percent-encoded>`
 * with an ASCII-safe `filename=` fallback for older clients.
 */
function contentDisposition(id: string, ext: 'yaml' | 'json'): string {
  const isAscii = /^[\x20-\x7e]+$/.test(id) && !id.includes('"') && !id.includes('\\');
  if (isAscii) return `attachment; filename="${id}.${ext}"`;
  const asciiFallback = `org.${ext}`;
  const encoded = encodeURIComponent(`${id}.${ext}`);
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
}

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
        let data: unknown;
        try {
          data = store.get(id);
          // Serialize eagerly: a throw here must surface as a 500 with no
          // Content-Disposition header, so a failure can never look like a
          // successful download.
          JSON.stringify(data);
        } catch (e: any) {
          reply.code(500);
          return { error: `Export failed: ${e?.message ?? 'serialization error'}` };
        }
        reply.header('Content-Type', 'application/json; charset=utf-8');
        reply.header('Content-Disposition', contentDisposition(id, 'json'));
        return JSON.stringify(data, null, 2);
      }

      // Default: return raw YAML text
      reply.header('Content-Type', 'text/yaml; charset=utf-8');
      reply.header('Content-Disposition', contentDisposition(id, 'yaml'));
      return raw;
    },
  );
}
