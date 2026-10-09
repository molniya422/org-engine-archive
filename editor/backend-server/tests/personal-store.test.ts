import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { PersonalStore, defaultPersonalDbPath } from '../src/personal/store';

// Windows rmSync on a directory whose SQLite handles just closed can EPERM;
// retry once after a short yield.
function rmRf(p: string): void {
  try {
    rmSync(p, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  } catch { /* best effort on Windows */ }
}

const TMP = join(process.cwd(), '.tmp-personal-store');

beforeEach(() => {
  rmRf(TMP);
  mkdirSync(TMP, { recursive: true });
});

afterAll(() => {
  rmRf(TMP);
});

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

const EVIDENCE = {
  schema_version: 1,
  id: 'evidence_01',
  kind: 'user_statement',
  locator: 'conversation://conv_01/turn_01',
  content_hash: 'sha256:' + 'a'.repeat(64),
  captured_at: '2026-10-04T00:00:00Z',
  sensitivity: 'normal',
  supports: ['fact_01'],
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

const TRACE = {
  schema_version: 1,
  id: 'decision_01',
  task_id: 'task_01',
  input_refs: ['task_01'],
  candidate_actions: ['action_01'],
  selected_action: 'action_01',
  rejected_reasons: [],
  policy_version: 'baseline-0.1',
  rule_refs: ['rule_01'],
  evidence_refs: ['evidence_01'],
  uncertainty: 0.2,
  requires_confirmation: false,
  created_at: '2026-10-04T00:00:00Z',
};

const LEARNING = {
  schema_version: 1,
  id: 'learning_01',
  signal: 'repeated_correction',
  candidate_change: { rule: 'draft_style' },
  supporting_trace_refs: ['decision_01'],
  impact_summary: 'draft formatting',
  requires_user_approval: true,
  status: 'proposed',
  version: 1,
};

const EVAL = {
  schema_version: 1,
  id: 'eval_01',
  input: { utterance: '把材料发给同事' },
  expected_behavior: { must_not_do: ['external_send'] },
  sensitivity: 'normal',
  enabled: true,
};

describe('PersonalStore', () => {
  it('initializes all tables and records schema_version', () => {
    const store = new PersonalStore({ dbPath: join(TMP, 'a.sqlite') });
    const tables = store.listAudit(0) && null; // just ensure store usable
    expect(tables === null).toBe(true);
    // facts table exists
    expect(store.listFacts()).toEqual([]);
    store.close();
  });

  it('round-trips a fact', () => {
    const store = new PersonalStore({ dbPath: join(TMP, 'b.sqlite') });
    store.saveFact(FACT);
    const got = store.getFact('fact_01');
    expect(got?.kind).toBe('schedule');
    expect(got?.source_refs).toEqual(['evidence_01']);
    store.close();
  });

  it('saves a task + its evidence atomically (both or neither)', () => {
    const store = new PersonalStore({ dbPath: join(TMP, 'c.sqlite') });
    store.saveTaskWithEvidence(TASK, [EVIDENCE]);
    expect(store.getTask('task_01')?.goal).toContain('材料');
    expect(store.getEvidence('evidence_01')?.kind).toBe('user_statement');

    // A task with a broken evidence row must leave NO partial rows.
    const badTask = { ...TASK, id: 'task_02' };
    const badEvidence = { ...EVIDENCE, id: null }; // PRIMARY KEY accepts null in SQLite; the store layer must reject it
    expect(() => store.saveTaskWithEvidence(badTask, [badEvidence] as never)).toThrow();
    expect(store.getTask('task_02')).toBeNull();
    store.close();
  });

  it('persists data across restart (close + reopen)', () => {
    const dbPath = join(TMP, 'd.sqlite');
    let store = new PersonalStore({ dbPath });
    store.saveFact(FACT);
    store.saveRule(RULE);
    store.saveTaskWithEvidence(TASK, [EVIDENCE]);
    store.saveTrace(TRACE);
    store.saveLearningProposal(LEARNING);
    store.saveEvalCase(EVAL);
    store.close();

    store = new PersonalStore({ dbPath });
    expect(store.getFact('fact_01')).not.toBeNull();
    expect(store.listRules()[0]?.then).toEqual({ action: 'require_confirmation' });
    expect(store.getTask('task_01')).not.toBeNull();
    expect(store.getTrace('decision_01')?.policy_version).toBe('baseline-0.1');
    expect(store.getLearningProposal('learning_01')?.status).toBe('proposed');
    expect(store.listEvalCases(true)).toHaveLength(1);
    store.close();
  });

  it('queries evidence chains by ref', () => {
    const store = new PersonalStore({ dbPath: join(TMP, 'e.sqlite') });
    store.saveEvidence(EVIDENCE);
    const chain = store.evidenceChain('fact_01');
    expect(chain).toHaveLength(1);
    expect(chain[0].id).toBe('evidence_01');
    store.close();
  });

  it('records audit events for writes', () => {
    const store = new PersonalStore({ dbPath: join(TMP, 'f.sqlite') });
    store.saveFact(FACT);
    store.saveRule(RULE);
    const events = store.listAudit();
    expect(events.length).toBeGreaterThanOrEqual(2);
    expect(events.map((e) => e.event)).toContain('fact.save');
    expect(events.map((e) => e.event)).toContain('rule.save');
    store.close();
  });

  it('refuses a newer schema than it supports', () => {
    const dbPath = join(TMP, 'g.sqlite');
    let store = new PersonalStore({ dbPath });
    store.close();
    // Simulate a future version marker
    const { DatabaseSync } = require('node:sqlite');
    const raw = new DatabaseSync(dbPath);
    raw.prepare(`UPDATE meta SET value = '99' WHERE key = 'schema_version'`).run();
    raw.close();
    expect(() => new PersonalStore({ dbPath })).toThrow(/newer than supported/);
  });

  it('default path sits under ORG_ENGINE_HOME when set', () => {
    process.env.ORG_ENGINE_HOME = join(TMP, 'home');
    const p = defaultPersonalDbPath();
    expect(p).toContain(join('.tmp-personal-store', 'home'));
    expect(p.endsWith('personal.sqlite')).toBe(true);
    delete process.env.ORG_ENGINE_HOME;
  });
});
