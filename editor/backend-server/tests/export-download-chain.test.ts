import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import Fastify from 'fastify';
import { registerOrgRoutes } from '../src/org-config.routes';
import { OrgConfigStore } from '../src/org-config/store';

/**
 * Exercises the exact chain the browser uses for a download:
 * GET /export -> raw text -> Blob -> object URL -> anchor click.
 * The ExportMenu component builds a Blob from this text, so a "successful"
 * response whose body is empty or is an error envelope means the user gets a
 * broken file with no failure indication — that is the defect being pinned.
 */
let home = '';

function makeApp(store: OrgConfigStore) {
  const app = Fastify({ logger: false });
  registerOrgRoutes(app, store);
  return app;
}

beforeEach(() => {
  home = join(process.cwd(), '.tmp-export2', Math.random().toString(36).slice(2));
  process.env.ORG_ENGINE_HOME = home;
});

afterAll(() => {
  try { rmSync(join(process.cwd(), '.tmp-export2'), { recursive: true, force: true }); } catch { /* ignore */ }
});

describe('export download chain (ExportMenu -> api.exportOrg -> Blob)', () => {
  const ORG = {
    version: '2.0',
    org: { name: 't', departments: [{ name: 'QA', roles: [{ id: 'qa.lead', name: 'lead', agentType: 'g', bound_skills: ['pr-review'] }] }] },
    budget: {},
  };

  it('produces a non-empty, parseable YAML download body', async () => {
    const store = new OrgConfigStore();
    store.save('t', ORG);
    const app = makeApp(store);
    const res = await app.inject({ method: 'GET', url: '/api/v1/orgs/t/export?format=yaml' });

    expect(res.statusCode).toBe(200);
    const body = res.body;
    // The Blob built by the frontend must carry real content, not "" or an
    // error envelope, otherwise the user downloads an unusable file.
    expect(body.length).toBeGreaterThan(0);
    expect(body).not.toContain('"error"');
    expect(body).toContain('version');
    expect(body).toContain('qa.lead');
  });

  it('produces a non-empty, parseable JSON download body', async () => {
    const store = new OrgConfigStore();
    store.save('t', ORG);
    const app = makeApp(store);
    const res = await app.inject({ method: 'GET', url: '/api/v1/orgs/t/export?format=json' });

    expect(res.statusCode).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(() => JSON.parse(res.body)).not.toThrow();
    expect(JSON.parse(res.body)).toEqual(ORG);
  });

  it('does not hand back an error envelope on the 200 path', async () => {
    const store = new OrgConfigStore();
    store.save('t', ORG);
    const app = makeApp(store);
    const res = await app.inject({ method: 'GET', url: '/api/v1/orgs/t/export' });
    expect(res.statusCode).toBe(200);
    expect(res.body).not.toMatch(/^\s*\{/); // YAML, not a JSON error object
  });
});
