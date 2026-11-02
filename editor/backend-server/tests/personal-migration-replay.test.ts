import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { mkdirSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { PersonalStore, PERSONAL_SCHEMA_VERSION } from '../src/personal/store';

const requireNative = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { DatabaseSync } = requireNative('node:sqlite') as typeof import('node:sqlite');

const TMP = join(process.cwd(), '.tmp-migration-replay');
const MIGRATIONS = join(process.cwd(), 'src', 'personal', 'migrations');

function rmRf(p: string): void {
  try { rmSync(p, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }); } catch { /* windows */ }
}

/** 用 001-003 手工建一个 v3 库，模拟真实用户旧库。 */
function makeV3Db(dbPath: string): void {
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(['001_personal.sql', '002_learning_signals.sql', '003_learning_versions.sql']
    .map((name) => readFileSync(join(MIGRATIONS, name), 'utf-8'))
    .join('\n'));
  db.prepare(`INSERT INTO meta (key, value) VALUES ('schema_version', '3')`).run();
  db.prepare(`
    INSERT INTO tasks (id, goal, contract, status, version, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    'task_legacy_01',
    '旧任务',
    JSON.stringify({ schema_version: 1, id: 'task_legacy_01', goal: '旧任务', version: 1 }),
    'draft',
    1,
    '2026-10-01T00:00:00Z',
    '2026-10-01T00:00:00Z',
  );
  // 额外写一行业务数据，验证重放不会清空旧数据。
  db.prepare(`
    INSERT INTO facts (id, kind, value, source_refs, confidence, valid_from, sensitivity, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run('fact_legacy_01', 'schedule', '{}', '[]', 0.9, '2026-10-01T00:00:00Z', 'normal', 'active',
    '2026-10-01T00:00:00Z', '2026-10-01T00:00:00Z');
  db.close();
}

beforeEach(() => { rmRf(TMP); mkdirSync(TMP, { recursive: true }); });
afterAll(() => rmRf(TMP));

describe('personal migration replay (v3 → v5)', () => {
  it('upgrades a v3 database without losing data and creates the 004/005 schema', () => {
    const dbPath = join(TMP, 'personal.sqlite');
    makeV3Db(dbPath);

    const store = new PersonalStore({ dbPath });
    expect(PERSONAL_SCHEMA_VERSION).toBe(5);
    // 旧数据仍在。
    expect(store.getTask('task_legacy_01')!.goal).toBe('旧任务');
    expect(store.getFact('fact_legacy_01')!.id).toBe('fact_legacy_01');
    store.close();

    const raw = new DatabaseSync(dbPath);
    const version = Number((raw.prepare(`SELECT value FROM meta WHERE key = 'schema_version'`).get() as any).value);
    expect(version).toBe(5);
    const tables = (raw.prepare(`
      SELECT name FROM sqlite_master
      WHERE type = 'table' AND name IN ('executions','personal_settings','search_receipts')
      ORDER BY name
    `).all() as any[]).map((r) => r.name);
    expect(tables).toEqual(['executions', 'personal_settings', 'search_receipts']);
    // 005：恢复执行所需的 run_spec 列。
    const cols = (raw.prepare(`PRAGMA table_info(executions)`).all() as any[]).map((c) => c.name);
    expect(cols).toContain('run_spec');
    raw.close();
  });

  it('reopening an already-migrated database is a no-op (005 ALTER does not replay)', () => {
    const dbPath = join(TMP, 'personal.sqlite');
    makeV3Db(dbPath);
    new PersonalStore({ dbPath }).close();
    // 第二次打开：列已存在，005 必须被跳过而不是 duplicate column。
    const store = new PersonalStore({ dbPath });
    expect(store.getTask('task_legacy_01')!.goal).toBe('旧任务');
    store.close();
  });
});
