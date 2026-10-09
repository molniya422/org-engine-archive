import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import Fastify from 'fastify';
import { PersonalStore } from '../src/personal/store';
import { EvidenceRepository } from '../src/personal/evidence';
import { registerPersonalRoutes } from '../src/personal/routes';

const TMP = join(process.cwd(), '.tmp-personal-routes');
const WORKSPACE = join(TMP, 'workspace');

function rmRf(p: string): void {
  try { rmSync(p, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }); } catch { /* windows */ }
}

const FACT = {
  schema_version: 1,
  id: 'fact_01',
  kind: 'schedule',
  value: { weekday: 'friday', activity: 'gym' },
  source_refs: ['evidence_01'],
  confidence: 0.9,
  valid_from: '2026-10-04T00:00:00Z',
  valid_until: null,
  sensitivity: 'normal',
  status: 'active',
  created_at: '2026-10-04T00:00:00Z',
  updated_at: '2026-10-04T00:00:00Z',
};

const RULE = {
  schema_version: 1,
  id: 'rule_01',
  when: { event: 'external_send', scope: 'all' },
  then: { action: 'require_confirmation' },
  priority: 100,
  source: 'user_explicit',
  status: 'active',
  version: 1,
};

const TASK = {
  schema_version: 1,
  id: 'task_01',
  goal: '整理本周收到的材料并列出待办',
  success_criteria: ['列出标题和来源'],
  allowed_scopes: ['workspace/inbox'],
  forbidden_actions: ['external_send'],
  required_evidence: ['file_ref'],
  risk_level: 'low',
  confirmation_points: [],
  status: 'draft',
  version: 1,
  created_at: '2026-10-04T00:00:00Z',
};

async function buildApp() {
  const store = new PersonalStore({ dbPath: join(TMP, 'personal.sqlite') });
  const evidence = new EvidenceRepository(store, WORKSPACE);
  const app = Fastify({ logger: false });
  registerPersonalRoutes(app, { store, evidence });
  return { app, store, evidence };
}

beforeEach(() => {
  rmRf(TMP);
  mkdirSync(WORKSPACE, { recursive: true });
});

afterAll(() => rmRf(TMP));

async function post(app: any, url: string, body: unknown) {
  const res = await app.inject({ method: 'POST', url, payload: body });
  return { status: res.statusCode, body: res.json() };
}

async function get(app: any, url: string) {
  const res = await app.inject({ method: 'GET', url });
  return { status: res.statusCode, body: res.json() };
}

async function patch(app: any, url: string, body: unknown) {
  const res = await app.inject({ method: 'PATCH', url, payload: body });
  return { status: res.statusCode, body: res.json() };
}

describe('P1.4 personal API', () => {
  it('creates a valid fact and lists it', async () => {
    const { app, store } = await buildApp();
    const created = await post(app, '/api/v1/personal/facts', FACT);
    expect(created.status).toBe(201);
    const list = await get(app, '/api/v1/personal/facts');
    expect(list.body.facts).toHaveLength(1);
    expect(list.body.facts[0].kind).toBe('schedule');
    // write audited
    const events = store.listAudit();
    expect(events.some((e: any) => e.event === 'fact.save')).toBe(true);
    store.close();
  });

  it('rejects an invalid fact with 400 and stores nothing', async () => {
    const { app, store } = await buildApp();
    const bad = { ...FACT, confidence: 7 };
    const res = await post(app, '/api/v1/personal/facts', bad);
    expect(res.status).toBe(400);
    expect(res.body.error).toBeTruthy();
    expect(store.listFacts()).toHaveLength(0);
    store.close();
  });

  it('creates rules, patches status with version bump, rejects bad transitions', async () => {
    const { app, store } = await buildApp();
    expect((await post(app, '/api/v1/personal/rules', RULE)).status).toBe(201);

    // invalid rule: model-invented source
    const bad = { ...RULE, id: 'rule_02', source: 'model_guess' };
    expect((await post(app, '/api/v1/personal/rules', bad)).status).toBe(400);

    const patched = await patch(app, '/api/v1/personal/rules/rule_01', { status: 'paused' });
    expect(patched.status).toBe(200);
    expect(patched.body.status).toBe('paused');
    expect(patched.body.version).toBe(2);

    expect((await patch(app, '/api/v1/personal/rules/rule_01', { status: 'explode' })).status).toBe(400);
    expect((await patch(app, '/api/v1/personal/rules/rule_404', { status: 'paused' })).status).toBe(404);
    store.close();
  });

  it('creates a task with existing evidence refs and returns the detail chain', async () => {
    const { app, store } = await buildApp();
    // seed evidence via the repository
    const { writeFileSync } = await import('node:fs');
    writeFileSync(join(WORKSPACE, 'inbox-a.txt'), '报销单');
    const ev = evidence0(store, WORKSPACE).fromFile('inbox-a.txt', { supports: ['task_01'] });

    const res = await post(app, '/api/v1/personal/tasks', { task: TASK, evidence_refs: [ev.id] });
    expect(res.status).toBe(201);

    const detail = await get(app, '/api/v1/personal/tasks/task_01');
    expect(detail.status).toBe(200);
    expect(detail.body.task.goal).toContain('材料');
    expect(detail.body.evidence).toHaveLength(1);
    expect(detail.body.evidence[0].id).toBe(ev.id);
    store.close();
  });

  it('rejects a task whose evidence_refs do not exist (400, no partial write)', async () => {
    const { app, store } = await buildApp();
    const res = await post(app, '/api/v1/personal/tasks', { task: TASK, evidence_refs: ['evidence_nope'] });
    expect(res.status).toBe(400);
    expect(store.listTasks()).toHaveLength(0);
    store.close();
  });

  it('rejects a task that fails the schema', async () => {
    const { app, store } = await buildApp();
    const bad = { ...TASK, success_criteria: [] }; // no success criteria = undefinable done
    const res = await post(app, '/api/v1/personal/tasks', { task: bad });
    expect(res.status).toBe(400);
    expect(store.listTasks()).toHaveLength(0);
    store.close();
  });

  it('serves evidence chain and trace queries', async () => {
    const { app, store } = await buildApp();
    const { writeFileSync } = await import('node:fs');
    writeFileSync(join(WORKSPACE, 'b.txt'), 'b');
    const ev = evidence0(store, WORKSPACE).fromFile('b.txt', { supports: ['task_01', 'fact_01'] });

    const chain = await get(app, '/api/v1/personal/evidence?ref=task_01');
    expect(chain.body.evidence).toHaveLength(1);
    expect(chain.body.evidence[0].id).toBe(ev.id);

    // traces: empty until a trace is saved
    const traces = await get(app, '/api/v1/personal/traces/task_01');
    expect(traces.body.traces).toEqual([]);
    store.close();
  });
});

// helper: build a repo against the same store for seeding
import { EvidenceRepository as ER } from '../src/personal/evidence';
function evidence0(store: PersonalStore, workspace: string): ER {
  return new ER(store, workspace);
}
