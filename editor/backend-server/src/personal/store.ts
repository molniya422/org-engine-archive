/**
 * P1.2 — personal domain store on SQLite (WAL).
 *
 * Source of truth for the personal layer (plan §Tech Stack): facts, rules,
 * tasks, conversation states, evidence, actions, traces, eval cases, learning
 * proposals, audit events. Everything else (Python engine, Octop receipts)
 * communicates through versioned envelopes and never writes this DB directly.
 *
 * Uses node:sqlite (DatabaseSync) — no native module dependency. All writes
 * go through transactions. Field names follow editor/schema/personal/*.schema.json.
 */
// node:sqlite is a Node >=22.5 built-in that vite/vitest 5.x cannot resolve in
// its transform pipeline; createRequire uses Node's native resolution and works
// in dev (tsx), tests (vitest) and the esbuild CJS bundle alike.
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const requireNative = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { DatabaseSync } = requireNative('node:sqlite') as typeof import('node:sqlite');

export const PERSONAL_SCHEMA_VERSION = 3;

const MIGRATIONS = [
  '001_personal.sql',
  '002_learning_signals.sql',
  '003_learning_versions.sql',
];

export class PersonalValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PersonalValidationError';
  }
}

export interface PersonalStoreOptions {
  /** Absolute path to personal.sqlite. Defaults under ORG_ENGINE_HOME. */
  dbPath?: string;
}

/** Default data dir: <ORG_ENGINE_HOME|$HOME/.org-engine-editor>/personal */
export function defaultPersonalDbPath(): string {
  const home = process.env.ORG_ENGINE_HOME ?? join(process.env.USERPROFILE ?? process.env.HOME ?? '.', '.org-engine-editor');
  return join(home, 'personal', 'personal.sqlite');
}

function nowIso(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export class PersonalStore {
  private db: DatabaseSync;

  constructor(options: PersonalStoreOptions = {}) {
    const dbPath = options.dbPath ?? defaultPersonalDbPath();
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new DatabaseSync(dbPath);
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec('PRAGMA foreign_keys = ON;');
    this.migrate();
  }

  /** Apply pending migrations, tracking schema_version in meta. */
  migrate(): void {
    // meta may not exist yet on a fresh database.
    const hasMeta = this.db
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'meta'`)
      .get();
    const row = hasMeta
      ? this.db.prepare(`SELECT value FROM meta WHERE key = 'schema_version'`).get()
      : undefined;
    const current = row ? Number((row as { value: string }).value) : 0;
    if (current > PERSONAL_SCHEMA_VERSION) {
      throw new Error(
        `personal.sqlite schema_version ${current} is newer than supported ${PERSONAL_SCHEMA_VERSION}`,
      );
    }
    if (current === PERSONAL_SCHEMA_VERSION) return;

    // Apply migrations sequentially, stepping schema_version from `current` to
    // PERSONAL_SCHEMA_VERSION in one transaction.
    const migrationSql = MIGRATIONS
      .map((name) =>
        readFileSync(
          join(dirname(fileURLToPath(import.meta.url)), 'migrations', name),
          'utf-8',
        ),
      )
      .join('\n');
    this.db.exec('BEGIN');
    try {
      this.db.exec(migrationSql);
      this.db
        .prepare(
          `INSERT INTO meta (key, value) VALUES ('schema_version', ?)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        )
        .run(String(PERSONAL_SCHEMA_VERSION));
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }

  // -- audit ---------------------------------------------------------------

  audit(actor: string, event: string, refType: string, refId: string, detail: unknown = {}): void {
    this.db
      .prepare(
        `INSERT INTO audit_events (at, actor, event, ref_type, ref_id, detail) VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(nowIso(), actor, event, refType, refId, JSON.stringify(detail ?? {}));
  }

  listAudit(limit = 50): Array<{ seq: number; at: string; actor: string; event: string; ref_type: string; ref_id: string; detail: string }> {
    return this.db
      .prepare(`SELECT * FROM audit_events ORDER BY seq DESC LIMIT ?`)
      .all(limit) as never;
  }

  // -- facts ---------------------------------------------------------------

  saveFact(fact: Record<string, unknown>): void {
    const stmt = this.db.prepare(`
      INSERT INTO facts (id, kind, value, source_refs, confidence, valid_from, valid_until, sensitivity, status, created_at, updated_at)
      VALUES (@id, @kind, @value, @source_refs, @confidence, @valid_from, @valid_until, @sensitivity, @status, @created_at, @updated_at)
      ON CONFLICT(id) DO UPDATE SET
        kind = excluded.kind, value = excluded.value, source_refs = excluded.source_refs,
        confidence = excluded.confidence, valid_from = excluded.valid_from,
        valid_until = excluded.valid_until, sensitivity = excluded.sensitivity,
        status = excluded.status, updated_at = excluded.updated_at
    `);
    this.db.exec('BEGIN');
    try {
      stmt.run({
        id: fact.id,
        kind: fact.kind,
        value: JSON.stringify(fact.value ?? {}),
        source_refs: JSON.stringify(fact.source_refs ?? []),
        confidence: fact.confidence,
        valid_from: fact.valid_from,
        valid_until: fact.valid_until ?? null,
        sensitivity: fact.sensitivity,
        status: fact.status,
        created_at: fact.created_at ?? nowIso(),
        updated_at: nowIso(),
      });
      this.audit('user', 'fact.save', 'fact', String(fact.id), { status: fact.status });
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }

  getFact(id: string): Record<string, unknown> | null {
    const row = this.db.prepare(`SELECT * FROM facts WHERE id = ?`).get(id) as any;
    if (!row) return null;
    return { ...row, value: JSON.parse(row.value), source_refs: JSON.parse(row.source_refs) };
  }

  listFacts(status?: string): Array<Record<string, unknown>> {
    const rows = (
      status
        ? this.db.prepare(`SELECT * FROM facts WHERE status = ? ORDER BY updated_at DESC`).all(status)
        : this.db.prepare(`SELECT * FROM facts ORDER BY updated_at DESC`).all()
    ) as any[];
    return rows.map((r) => ({ ...r, value: JSON.parse(r.value), source_refs: JSON.parse(r.source_refs) }));
  }

  // -- rules ---------------------------------------------------------------

  saveRule(rule: Record<string, unknown>): void {
    this.db.exec('BEGIN');
    try {
      this.db
        .prepare(`
        INSERT INTO rules (id, when_json, then_json, priority, source, status, version, created_at, updated_at)
        VALUES (@id, @when, @then, @priority, @source, @status, @version, @created_at, @updated_at)
        ON CONFLICT(id) DO UPDATE SET
          when_json = excluded.when_json, then_json = excluded.then_json,
          priority = excluded.priority, source = excluded.source,
          status = excluded.status, version = excluded.version, updated_at = excluded.updated_at
      `)
        .run({
          id: rule.id,
          when: JSON.stringify(rule.when ?? {}),
          then: JSON.stringify(rule.then ?? {}),
          priority: rule.priority ?? 0,
          source: rule.source,
          status: rule.status,
          version: rule.version ?? 1,
          created_at: (rule as any).created_at ?? nowIso(),
          updated_at: nowIso(),
        });
      this.audit('user', 'rule.save', 'rule', String(rule.id), { version: rule.version });
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }

  listRules(status?: string): Array<Record<string, unknown>> {
    const rows = (
      status
        ? this.db.prepare(`SELECT * FROM rules WHERE status = ? ORDER BY priority DESC`).all(status)
        : this.db.prepare(`SELECT * FROM rules ORDER BY priority DESC`).all()
    ) as any[];
    return rows.map((r) => ({
      id: r.id,
      when: JSON.parse(r.when_json),
      then: JSON.parse(r.then_json),
      priority: r.priority,
      source: r.source,
      status: r.status,
      version: r.version,
      created_at: r.created_at,
      updated_at: r.updated_at,
    }));
  }

  // -- tasks ---------------------------------------------------------------

  /**
   * Save a task contract together with its evidence in one transaction:
   * a task must never exist without the evidence it cites.
   */
  saveTaskWithEvidence(task: Record<string, unknown>, evidence: Array<Record<string, unknown>>): void {
    this.db.exec('BEGIN');
    try {
      this.db
        .prepare(`
        INSERT INTO tasks (id, goal, contract, status, version, created_at, updated_at)
        VALUES (@id, @goal, @contract, @status, @version, @created_at, @updated_at)
        ON CONFLICT(id) DO UPDATE SET
          goal = excluded.goal, contract = excluded.contract, status = excluded.status,
          version = excluded.version, updated_at = excluded.updated_at
      `)
        .run({
          id: task.id,
          goal: task.goal,
          contract: JSON.stringify(task),
          status: task.status,
          version: task.version ?? 1,
          created_at: (task as any).created_at ?? nowIso(),
          updated_at: nowIso(),
        });
      for (const ev of evidence) {
        if (!ev || typeof ev.id !== 'string' || ev.id.length === 0) {
          throw new PersonalValidationError(`evidence row needs a non-empty id, got ${JSON.stringify(ev?.id)}`);
        }
        if (typeof ev.content_hash !== 'string' || !ev.content_hash.startsWith('sha256:')) {
          throw new PersonalValidationError(`evidence ${ev.id} needs a sha256 content_hash`);
        }
        this.db
          .prepare(`
          INSERT INTO evidence (id, kind, locator, content_hash, captured_at, sensitivity, supports, created_at)
          VALUES (@id, @kind, @locator, @content_hash, @captured_at, @sensitivity, @supports, @created_at)
          ON CONFLICT(id) DO UPDATE SET
            kind = excluded.kind, locator = excluded.locator, content_hash = excluded.content_hash,
            captured_at = excluded.captured_at, sensitivity = excluded.sensitivity, supports = excluded.supports
        `)
          .run({
            id: ev.id,
            kind: ev.kind,
            locator: ev.locator,
            content_hash: ev.content_hash,
            captured_at: ev.captured_at,
            sensitivity: ev.sensitivity,
            supports: JSON.stringify(ev.supports ?? []),
            created_at: (ev as any).created_at ?? nowIso(),
          });
      }
      this.audit('user', 'task.save', 'task', String(task.id), { status: task.status, evidence: evidence.length });
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }

  getTask(id: string): Record<string, unknown> | null {
    const row = this.db.prepare(`SELECT * FROM tasks WHERE id = ?`).get(id) as any;
    if (!row) return null;
    return { ...JSON.parse(row.contract), status: row.status, version: row.version, updated_at: row.updated_at };
  }

  listTasks(status?: string): Array<Record<string, unknown>> {
    const rows = (
      status
        ? this.db.prepare(`SELECT * FROM tasks WHERE status = ? ORDER BY updated_at DESC`).all(status)
        : this.db.prepare(`SELECT * FROM tasks ORDER BY updated_at DESC`).all()
    ) as any[];
    return rows.map((r) => ({ ...JSON.parse(r.contract), status: r.status, version: r.version, updated_at: r.updated_at }));
  }

  // -- evidence ------------------------------------------------------------

  saveEvidence(ev: Record<string, unknown>): void {
    this.db
      .prepare(`
      INSERT INTO evidence (id, kind, locator, content_hash, captured_at, sensitivity, supports, created_at)
      VALUES (@id, @kind, @locator, @content_hash, @captured_at, @sensitivity, @supports, @created_at)
      ON CONFLICT(id) DO UPDATE SET
        kind = excluded.kind, locator = excluded.locator, content_hash = excluded.content_hash,
        captured_at = excluded.captured_at, sensitivity = excluded.sensitivity, supports = excluded.supports
    `)
      .run({
        id: ev.id,
        kind: ev.kind,
        locator: ev.locator,
        content_hash: ev.content_hash,
        captured_at: ev.captured_at,
        sensitivity: ev.sensitivity,
        supports: JSON.stringify(ev.supports ?? []),
        created_at: (ev as any).created_at ?? nowIso(),
      });
    this.audit('system', 'evidence.save', 'evidence', String(ev.id), { kind: ev.kind });
  }

  getEvidence(id: string): Record<string, unknown> | null {
    const row = this.db.prepare(`SELECT * FROM evidence WHERE id = ?`).get(id) as any;
    if (!row) return null;
    return { ...row, supports: JSON.parse(row.supports) };
  }

  /** Chain query: evidence supporting a given fact/decision/action ref. */
  evidenceChain(refId: string): Array<Record<string, unknown>> {
    const rows = this.db
      .prepare(`SELECT * FROM evidence WHERE supports LIKE ? ORDER BY captured_at`)
      .all(`%"${refId}"%`) as any[];
    return rows.map((r) => ({ ...r, supports: JSON.parse(r.supports) }));
  }

  // -- traces --------------------------------------------------------------

  saveTrace(trace: Record<string, unknown>): void {
    this.db.exec('BEGIN');
    try {
      this.db
        .prepare(`INSERT INTO traces (id, task_id, trace, created_at) VALUES (?, ?, ?, ?)`)
        .run(trace.id, trace.task_id, JSON.stringify(trace), (trace as any).created_at ?? nowIso());
      this.audit('system', 'trace.save', 'decision', String(trace.id), { task_id: trace.task_id });
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }

  getTrace(id: string): Record<string, unknown> | null {
    const row = this.db.prepare(`SELECT * FROM traces WHERE id = ?`).get(id) as any;
    return row ? JSON.parse(row.trace) : null;
  }

  listTraces(taskId: string): Array<Record<string, unknown>> {
    return (this.db.prepare(`SELECT trace FROM traces WHERE task_id = ? ORDER BY created_at`).all(taskId) as any[])
      .map((r) => JSON.parse(r.trace));
  }

  // -- learning proposals ---------------------------------------------------

  saveLearningProposal(p: Record<string, unknown>): void {
    this.db.exec('BEGIN');
    try {
      this.db
        .prepare(`
        INSERT INTO learning_proposals (id, proposal, status, version, created_at, updated_at)
        VALUES (@id, @proposal, @status, @version, @created_at, @updated_at)
        ON CONFLICT(id) DO UPDATE SET
          proposal = excluded.proposal, status = excluded.status,
          version = excluded.version, updated_at = excluded.updated_at
      `)
        .run({
          id: p.id,
          proposal: JSON.stringify(p),
          status: p.status,
          version: p.version ?? 1,
          created_at: (p as any).created_at ?? nowIso(),
          updated_at: nowIso(),
        });
      this.audit('user', 'learning.save', 'learning', String(p.id), { status: p.status });
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }

  getLearningProposal(id: string): Record<string, unknown> | null {
    const row = this.db.prepare(`SELECT * FROM learning_proposals WHERE id = ?`).get(id) as any;
    return row ? { ...JSON.parse(row.proposal), updated_at: row.updated_at } : null;
  }

  // -- learning signals (P7.1) ---------------------------------------------

  /**
   * Save a behavior signal. The signal JSON is ALREADY redacted by the engine
   * (personal/learning/signals.py) before it reaches here — this store never
   * sees high-sensitivity raw text. Every signal must link a task, a trace and
   * at least one evidence row.
   */
  saveLearningSignal(sig: Record<string, unknown>): void {
    if (!sig.task_id || !sig.trace_id) {
      throw new PersonalValidationError(`learning signal needs task_id and trace_id`);
    }
    const evidenceIds = (sig.evidence_ids ?? []) as unknown[];
    if (!Array.isArray(evidenceIds) || evidenceIds.length === 0) {
      throw new PersonalValidationError(`learning signal needs at least one evidence_id`);
    }
    const events = ['accepted', 'edited', 'rejected', 'revoked', 'repeated_correction'];
    if (!events.includes(String(sig.event))) {
      throw new PersonalValidationError(`unknown learning signal event: ${sig.event}`);
    }
    this.db.exec('BEGIN');
    try {
      this.db
        .prepare(`
        INSERT INTO learning_signals
          (id, event, task_id, trace_id, evidence_ids, sensitivity, signal_json, recorded_at, created_at)
        VALUES (@id, @event, @task_id, @trace_id, @evidence_ids, @sensitivity, @signal_json, @recorded_at, @created_at)
        ON CONFLICT(id) DO UPDATE SET
          event = excluded.event, task_id = excluded.task_id, trace_id = excluded.trace_id,
          evidence_ids = excluded.evidence_ids, sensitivity = excluded.sensitivity,
          signal_json = excluded.signal_json, recorded_at = excluded.recorded_at
      `)
        .run({
          id: sig.id,
          event: sig.event,
          task_id: sig.task_id,
          trace_id: sig.trace_id,
          evidence_ids: JSON.stringify(evidenceIds),
          sensitivity: sig.sensitivity ?? 'normal',
          signal_json: JSON.stringify(sig),
          recorded_at: (sig.recorded_at as string) ?? nowIso(),
          created_at: nowIso(),
        });
      this.audit('user', 'learning.signal', 'learning', String(sig.id), { event: sig.event, task_id: sig.task_id });
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }

  listLearningSignals(taskId?: string, limit = 200): Array<Record<string, unknown>> {
    const rows = (
      taskId
        ? this.db
            .prepare(`SELECT * FROM learning_signals WHERE task_id = ? ORDER BY recorded_at DESC LIMIT ?`)
            .all(taskId, limit)
        : this.db.prepare(`SELECT * FROM learning_signals ORDER BY recorded_at DESC LIMIT ?`).all(limit)
    ) as any[];
    return rows.map((r) => JSON.parse(r.signal_json));
  }

  countLearningSignals(event: string): number {
    const row = this.db
      .prepare(`SELECT COUNT(*) AS n FROM learning_signals WHERE event = ?`)
      .get(event) as any;
    return row ? Number(row.n) : 0;
  }

  // -- learning versions (P7.3) ---------------------------------------------

  /**
   * Upsert a config version row. Content is immutable once written — updates
   * may only change status / eval_report / updated_at (audit-tracked outside).
   */
  saveLearningVersion(v: Record<string, unknown>): void {
    if (!['facts', 'rules', 'policy', 'prompts'].includes(String(v.kind))) {
      throw new PersonalValidationError(`unknown learning version kind: ${v.kind}`);
    }
    if (!['applied', 'enabled', 'superseded', 'rolled_back'].includes(String(v.status))) {
      throw new PersonalValidationError(`unknown learning version status: ${v.status}`);
    }
    const existing = this.db
      .prepare(`SELECT content FROM learning_versions WHERE version_id = ?`)
      .get(String(v.version_id)) as any;
    if (existing && v.content !== undefined) {
      const same = JSON.stringify(JSON.parse(existing.content)) === JSON.stringify(v.content);
      if (!same) {
        throw new PersonalValidationError(`version ${v.version_id} content is immutable`);
      }
    }
    this.db
      .prepare(`
      INSERT INTO learning_versions
        (version_id, kind, seq, content, proposal_id, status, eval_report, created_at, updated_at)
      VALUES (@version_id, @kind, @seq, @content, @proposal_id, @status, @eval_report, @created_at, @updated_at)
      ON CONFLICT(version_id) DO UPDATE SET
        status = excluded.status, eval_report = excluded.eval_report, updated_at = excluded.updated_at
    `)
      .run({
        version_id: v.version_id,
        kind: v.kind,
        seq: v.seq ?? 1,
        content: JSON.stringify(v.content ?? {}),
        proposal_id: v.proposal_id,
        status: v.status,
        eval_report: v.eval_report ?? '',
        created_at: (v as any).created_at ?? nowIso(),
        updated_at: nowIso(),
      });
    this.audit('system', 'learning.version', 'learning', String(v.version_id), {
      kind: v.kind, status: v.status, proposal_id: v.proposal_id,
    });
  }

  listLearningVersions(kind?: string): Array<Record<string, unknown>> {
    const rows = (
      kind
        ? this.db.prepare(`SELECT * FROM learning_versions WHERE kind = ? ORDER BY seq`).all(kind)
        : this.db.prepare(`SELECT * FROM learning_versions ORDER BY kind, seq`).all()
    ) as any[];
    return rows.map((r) => ({
      version_id: r.version_id,
      kind: r.kind,
      seq: r.seq,
      content: JSON.parse(r.content),
      proposal_id: r.proposal_id,
      status: r.status,
      eval_report: r.eval_report,
      created_at: r.created_at,
      updated_at: r.updated_at,
    }));
  }

  getLearningVersion(versionId: string): Record<string, unknown> | null {
    const row = this.db
      .prepare(`SELECT * FROM learning_versions WHERE version_id = ?`)
      .get(versionId) as any;
    if (!row) return null;
    return {
      version_id: row.version_id,
      kind: row.kind,
      seq: row.seq,
      content: JSON.parse(row.content),
      proposal_id: row.proposal_id,
      status: row.status,
      eval_report: row.eval_report,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  /** The currently enabled version for a kind (status = 'enabled'). */
  activeLearningVersion(kind: string): Record<string, unknown> | null {
    const rows = this.db
      .prepare(`SELECT * FROM learning_versions WHERE kind = ? ORDER BY seq DESC`).all(kind) as any[];
    for (const r of rows) {
      if (r.status === 'enabled') {
        return { ...r, content: JSON.parse(r.content) };
      }
    }
    return null;
  }

  listLearningProposals(): Array<Record<string, unknown>> {
    return (this.db
      .prepare(`SELECT * FROM learning_proposals ORDER BY updated_at DESC`).all() as any[])
      .map((r) => ({ ...JSON.parse(r.proposal), updated_at: r.updated_at }));
  }

  // -- eval cases ----------------------------------------------------------

  saveEvalCase(c: Record<string, unknown>): void {
    this.db
      .prepare(`
      INSERT INTO eval_cases (id, case_json, enabled, created_at, updated_at)
      VALUES (@id, @case_json, @enabled, @created_at, @updated_at)
      ON CONFLICT(id) DO UPDATE SET
        case_json = excluded.case_json, enabled = excluded.enabled, updated_at = excluded.updated_at
    `)
      .run({
        id: c.id,
        case_json: JSON.stringify(c),
        enabled: c.enabled === true ? 1 : 0,
        created_at: (c as any).created_at ?? nowIso(),
        updated_at: nowIso(),
      });
    this.audit('user', 'eval_case.save', 'eval', String(c.id), { enabled: c.enabled });
  }

  listEvalCases(enabledOnly = false): Array<Record<string, unknown>> {
    const rows = (
      enabledOnly
        ? this.db.prepare(`SELECT * FROM eval_cases WHERE enabled = 1`).all()
        : this.db.prepare(`SELECT * FROM eval_cases`).all()
    ) as any[];
    return rows.map((r) => JSON.parse(r.case_json));
  }

  close(): void {
    this.db.close();
  }
}
