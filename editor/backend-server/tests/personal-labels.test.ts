import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import Fastify from 'fastify';
import { PersonalStore } from '../src/personal/store';
import { EvidenceRepository } from '../src/personal/evidence';
import { registerPersonalRoutes } from '../src/personal/routes';

const TMP = join(process.cwd(), '.tmp-personal-labels');

function rmRf(p: string): void {
  try { rmSync(p, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }); } catch { /* windows */ }
}

beforeEach(() => rmRf(TMP));
afterAll(() => rmRf(TMP));

describe('P4.3 labels endpoint', () => {
  it('GET /personal/labels returns plain-language mappings without jargon', async () => {
    const store = new PersonalStore({ dbPath: join(TMP, 'p.sqlite') });
    const evidence = new EvidenceRepository(store);
    const app = Fastify({ logger: false });
    registerPersonalRoutes(app, { store, evidence });

    const res = await app.inject({ method: 'GET', url: '/api/v1/personal/labels' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.statuses.needs_confirmation).toBe('需要你确认');
    expect(body.routes.parallel).toBe('多人协作整理');
    expect(body.roles.gateway).toBe('传递站');
    expect(body.action_kinds.payment).toBe('付款');

    const allValues = JSON.stringify(body).toLowerCase();
    expect(allValues).not.toContain('agent');
    expect(allValues).not.toContain('orchestrator');
    expect(allValues).not.toContain('envelope');

    app.close();
    store.close();
  });
});
