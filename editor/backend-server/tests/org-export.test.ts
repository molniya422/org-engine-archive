import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import Fastify from 'fastify';
import { registerOrgRoutes } from '../src/org-config.routes';
import { OrgConfigStore } from '../src/org-config/store';

let home = '';

function makeApp(store: OrgConfigStore) {
  const app = Fastify({ logger: false });
  registerOrgRoutes(app, store);
  return app;
}

async function injectExport(app: any, id: string, format?: string) {
  const res = await app.inject({
    method: 'GET',
    url: `/api/v1/orgs/${encodeURIComponent(id)}/export${format ? `?format=${format}` : ''}`,
  });
  return { status: res.statusCode, headers: res.headers, body: res.body };
}

beforeEach(() => {
  home = join(process.cwd(), '.tmp-export', Math.random().toString(36).slice(2));
  process.env.ORG_ENGINE_HOME = home;
});

afterAll(() => {
  try { rmSync(join(process.cwd(), '.tmp-export'), { recursive: true, force: true }); } catch { /* ignore */ }
});

describe('org export', () => {
  const ORG = {
    version: '2.0',
    org: { name: 't', departments: [{ name: 'QA', roles: [{ id: 'qa.lead', name: 'lead', agentType: 'g', bound_skills: ['pr-review'] }] }] },
    budget: {},
  };

  it('returns YAML with a downloadable Content-Disposition', async () => {
    const store = new OrgConfigStore();
    store.save('t', ORG);
    const res = await injectExport(makeApp(store), 't');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/yaml');
    expect(res.headers['content-disposition']).toContain('attachment');
    expect(res.headers['content-disposition']).toContain('t.yaml');
    expect(res.body).toContain('qa.lead');
  });

  it('returns JSON that parses back to the stored org', async () => {
    const store = new OrgConfigStore();
    store.save('t', ORG);
    const res = await injectExport(makeApp(store), 't', 'json');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/json');
    expect(res.headers['content-disposition']).toContain('attachment');
    expect(res.headers['content-disposition']).toContain('t.json');
    expect(JSON.parse(res.body)).toEqual(ORG);
  });

  it('returns 404 when the org does not exist', async () => {
    const store = new OrgConfigStore();
    const res = await injectExport(makeApp(store), 'missing');
    expect(res.status).toBe(404);
    expect(JSON.parse(res.body).error).toBeTruthy();
  });

  it('returns 500 (not a success) when JSON serialization fails', async () => {
    const store = new OrgConfigStore();
    store.save('t', ORG);
    // Circular reference — JSON.stringify throws.
    (store.get as any) = () => {
      const circular: any = {};
      circular.self = circular;
      return circular;
    };
    const res = await injectExport(makeApp(store), 't', 'json');
    expect(res.status).toBe(500);
    expect(JSON.parse(res.body).error).toBeTruthy();
    // A failure must not be mistaken for a downloadable file.
    expect(res.headers['content-disposition']).toBeUndefined();
  });

  it('encodes non-ASCII filenames with RFC 5987 filename*', async () => {
    const store = new OrgConfigStore();
    store.save('中文组织', ORG);
    const res = await injectExport(makeApp(store), '中文组织');
    expect(res.status).toBe(200);
    const cd = res.headers['content-disposition'] as string;
    expect(cd).toContain("filename*=UTF-8''");
    // ASCII fallback must also be present for old clients.
    expect(cd).toMatch(/filename="/);
    // The percent-encoded name must decode back to the org id.
    const encoded = cd.match(/filename\*=UTF-8''([^;]+)/)?.[1];
    expect(decodeURIComponent(encoded!)).toBe('中文组织.yaml');
  });
});
