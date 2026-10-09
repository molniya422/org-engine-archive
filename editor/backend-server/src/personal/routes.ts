/**
 * P1.4 — personal API routes.
 *
 * Reads/writes go through PersonalStore + schema validation (P1.1) so bad
 * input returns 4xx and never writes half a record. Every write appends an
 * audit event. Endpoints:
 *
 *   GET    /api/v1/personal/facts            list (optional ?status=)
 *   POST   /api/v1/personal/facts            create/update (validated)
 *   GET    /api/v1/personal/rules            list
 *   POST   /api/v1/personal/rules            create/update (validated)
 *   PATCH  /api/v1/personal/rules/:id        status transitions
 *   POST   /api/v1/personal/tasks            create with evidence refs
 *   GET    /api/v1/personal/tasks/:id        detail incl. evidence chain
 *   GET    /api/v1/personal/evidence         list (?ref= chain query)
 *   GET    /api/v1/personal/traces/:taskId   decision traces for a task
 *
 * Ajv validates against the canonical schemas in editor/schema/personal/ —
 * the same files the Python engine reads.
 */
import { FastifyInstance } from 'fastify';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import { PersonalStore, PersonalValidationError } from './store';
import { EvidenceRepository, EvidenceRuleError } from './evidence';

const SCHEMA_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  'schema',
  'personal',
);

export interface PersonalRoutesOptions {
  store: PersonalStore;
  evidence: EvidenceRepository;
}

function buildValidators(): Record<string, ReturnType<Ajv2020['compile']>> {
  const ajv = new Ajv2020({ strict: false, allErrors: true });
  addFormats(ajv);
  const validators: Record<string, ReturnType<Ajv2020['compile']>> = {};
  for (const f of readdirSync(SCHEMA_DIR)) {
    if (!f.endsWith('.schema.json')) continue;
    const name = f.replace('.schema.json', '');
    validators[name] = ajv.compile(JSON.parse(readFileSync(join(SCHEMA_DIR, f), 'utf-8')));
  }
  return validators;
}

function nowIso(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export function registerPersonalRoutes(app: FastifyInstance, opts: PersonalRoutesOptions): void {
  const { store, evidence } = opts;
  const validators = buildValidators();

  function validate(schemaName: string, body: unknown): { ok: true } | { ok: false; errors: string } {
    const v = validators[schemaName];
    if (!v) return { ok: false, errors: `unknown schema ${schemaName}` };
    if (!v(body)) {
      const msgs = (v.errors ?? []).map((e) => `${e.instancePath} ${e.message}`).join('; ');
      return { ok: false, errors: msgs };
    }
    return { ok: true };
  }

  // -- facts ---------------------------------------------------------------

  app.get('/api/v1/personal/facts', async (req) => {
    const url = new URL(req.url, 'http://localhost');
    const status = url.searchParams.get('status') ?? undefined;
    return { facts: store.listFacts(status) };
  });

  app.post('/api/v1/personal/facts', async (req, reply) => {
    const body = req.body as Record<string, unknown>;
    const v = validate('user-fact', body);
    if (!v.ok) { reply.code(400); return { error: v.errors }; }
    try {
      store.saveFact({ ...body, updated_at: nowIso() });
      return reply.code(201).send({ ok: true, id: body.id });
    } catch (e) {
      if (e instanceof PersonalValidationError) { reply.code(400); return { error: e.message }; }
      throw e;
    }
  });

  // -- rules ---------------------------------------------------------------

  app.get('/api/v1/personal/rules', async (req) => {
    const url = new URL(req.url, 'http://localhost');
    const status = url.searchParams.get('status') ?? undefined;
    return { rules: store.listRules(status) };
  });

  app.post('/api/v1/personal/rules', async (req, reply) => {
    const body = req.body as Record<string, unknown>;
    const v = validate('user-rule', body);
    if (!v.ok) { reply.code(400); return { error: v.errors }; }
    store.saveRule(body);
    return reply.code(201).send({ ok: true, id: body.id });
  });

  app.patch<{ Params: { id: string }; Body: { status?: string } }>('/api/v1/personal/rules/:id', async (req, reply) => {
    const { id } = req.params;
    const existing = store.listRules().find((r) => r.id === id);
    if (!existing) { reply.code(404); return { error: 'rule not found' }; }
    const { status } = req.body ?? {};
    const allowed = ['active', 'paused', 'revoked'];
    if (status && !allowed.includes(status)) {
      reply.code(400); return { error: `status must be one of ${allowed.join(', ')}` };
    }
    const next = {
      ...(existing as Record<string, unknown>),
      ...(status ? { status } : {}),
      version: (existing as any).version + 1,
      // listRules() strips schema_version; the canonical schema requires it.
      schema_version: 1,
    } as Record<string, unknown>;
    // Internal bookkeeping columns are not part of the canonical wire schema.
    delete next.created_at;
    delete next.updated_at;
    const v = validate('user-rule', next);
    if (!v.ok) { reply.code(400); return { error: v.errors }; }
    store.saveRule(next);
    return { ok: true, id, status: next.status, version: next.version };
  });

  // -- tasks ---------------------------------------------------------------

  app.post('/api/v1/personal/tasks', async (req, reply) => {
    const body = req.body as { task?: Record<string, unknown>; evidence_refs?: string[] };
    const task = body?.task;
    if (!task) { reply.code(400); return { error: 'task required' }; }
    const v = validate('task-contract', task);
    if (!v.ok) { reply.code(400); return { error: v.errors }; }
    const refs = body.evidence_refs ?? [];
    const evidenceRows = refs
      .map((id) => store.getEvidence(id))
      .map((r) => r ?? undefined)
      .filter(Boolean) as Array<Record<string, unknown>>;
    if (evidenceRows.length !== refs.length) {
      reply.code(400); return { error: 'one or more evidence_refs do not exist' };
    }
    try {
      store.saveTaskWithEvidence(task, evidenceRows);
      return reply.code(201).send({ ok: true, id: task.id });
    } catch (e) {
      if (e instanceof PersonalValidationError) { reply.code(400); return { error: e.message }; }
      throw e;
    }
  });

  app.get<{ Params: { id: string } }>('/api/v1/personal/tasks/:id', async (req, reply) => {
    const task = store.getTask(req.params.id);
    if (!task) { reply.code(404); return { error: 'task not found' }; }
    const chain = (task as any).id ? evidence.chain(String((task as any).id)) : [];
    const traces = store.listTraces(String((task as any).id));
    return { task, evidence: chain, traces };
  });

  app.get('/api/v1/personal/tasks', async (req) => {
    const url = new URL(req.url, 'http://localhost');
    const status = url.searchParams.get('status') ?? undefined;
    return { tasks: store.listTasks(status) };
  });

  // -- evidence ------------------------------------------------------------

  app.get('/api/v1/personal/evidence', async (req) => {
    const url = new URL(req.url, 'http://localhost');
    const ref = url.searchParams.get('ref');
    const rows = ref ? evidence.chain(ref) : [];
    return { evidence: rows, ref };
  });

  // -- traces --------------------------------------------------------------

  app.get<{ Params: { taskId: string } }>('/api/v1/personal/traces/:taskId', async (req) => {
    return { traces: store.listTraces(req.params.taskId) };
  });

  // -- labels (P4.3) -------------------------------------------------------
  // User-facing plain-language labels for internal concepts. The frontend
  // uses these on home/tasks surfaces; the raw trace terms remain available
  // in this response for the advanced diagnostics page.

  app.get('/api/v1/personal/labels', async () => {
    const { roleLabel, routeLabel, statusLabel, actionKindLabel } = await import('./labels');
    return {
      roles: Object.fromEntries(
        ['ceo', 'manager', 'worker', 'reviewer', 'gateway', 'secretary'].map((r) => [r, roleLabel(r)]),
      ),
      routes: Object.fromEntries(['simple', 'review', 'parallel'].map((r) => [r, routeLabel(r)])),
      statuses: Object.fromEntries(
        ['select', 'ask_user', 'needs_confirmation', 'blocked', 'policy_error',
          'verified', 'incomplete', 'unverifiable', 'failed'].map((s) => [s, statusLabel(s)]),
      ),
      action_kinds: Object.fromEntries(
        ['external_send', 'delete', 'submit', 'payment'].map((k) => [k, actionKindLabel(k)]),
      ),
    };
  });
}
