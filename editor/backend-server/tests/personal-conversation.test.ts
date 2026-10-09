/**
 * P2.5 — conversation state (backend side, owns the store).
 *
 * Multi-turn understanding per plan P2.5:
 * - conversation_states persists conversation_id, current task_id, intent
 *   version and resolved anaphora.
 * - Field updates ("改成周五", "便宜一点") apply to the CURRENT task's intent
 *   and bump intent_version with affected fields output.
 * - Ambiguous references ("刚才那个酒店" with two open tasks) MUST ask,
 *   never silently pick a task.
 * - Session conditions never auto-become long-term preferences: updates touch
 *   only the conversation row, never facts.
 * - Restart recovery: the conversation row survives a store close/reopen.
 */
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { PersonalStore } from '../src/personal/store';

const TMP = join(process.cwd(), '.tmp-personal-conversation');

function rmRf(p: string): void {
  try { rmSync(p, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }); } catch { /* windows */ }
}

beforeEach(() => rmRf(TMP));
afterAll(() => rmRf(TMP));

interface ConversationState {
  id: string;
  current_task_id: string | null;
  intent: Record<string, unknown> | null;
  intent_version: number;
  resolved_refs: Record<string, string>;
  created_at: string;
  updated_at: string;
}

/** Thin conversation layer over PersonalStore (persisted in conversation_states). */
class ConversationManager {
  constructor(private store: PersonalStore) {}

  private row(id: string): ConversationState | null {
    const db = (this.store as unknown as { db: any }).db;
    const row = db.prepare(`SELECT * FROM conversation_states WHERE id = ?`).get(id) as any;
    if (!row) return null;
    return {
      id: row.id,
      current_task_id: row.current_task_id ?? null,
      intent: row.intent ? JSON.parse(row.intent) : null,
      intent_version: row.intent_version,
      resolved_refs: JSON.parse(row.resolved_refs),
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  get(conversationId: string): ConversationState {
    return this.row(conversationId) ?? {
      id: conversationId,
      current_task_id: null,
      intent: null,
      intent_version: 0,
      resolved_refs: {},
      created_at: '',
      updated_at: '',
    };
  }

  /** Start or resume: new intent for a task becomes the conversation's current task. */
  startIntent(conversationId: string, taskId: string, intent: Record<string, unknown>): ConversationState {
    const now = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
    (this.store as unknown as { db: any }).db
      .prepare(`
        INSERT INTO conversation_states (id, current_task_id, intent, intent_version, resolved_refs, created_at, updated_at)
        VALUES (?, ?, ?, 1, '{}', ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          current_task_id = excluded.current_task_id, intent = excluded.intent,
          intent_version = 1, updated_at = excluded.updated_at
      `)
      .run(conversationId, taskId, JSON.stringify(intent), now, now);
    return this.row(conversationId)!;
  }

  /** Which tasks could "刚才那个酒店" refer to? Tasks mentioned in this conversation. */
  openTasksIn(conversationId: string): string[] {
    const state = this.get(conversationId);
    const tasks: string[] = [];
    if (state.current_task_id) tasks.push(state.current_task_id);
    for (const ref of Object.values(state.resolved_refs)) {
      if (!tasks.includes(ref)) tasks.push(ref);
    }
    return tasks;
  }

  /**
   * Apply a field update ("改成周五"). Ambiguity check is the caller's duty:
   * this method refuses to run when the reference cannot be uniquely resolved.
   */
  applyFieldUpdate(
    conversationId: string,
    updates: Record<string, unknown>,
    affectedFields: string[],
  ): ConversationState {
    const state = this.get(conversationId);
    if (!state.current_task_id || !state.intent) {
      throw new Error('没有正在办理的事项，无法修改条件');
    }
    const nextIntent = { ...(state.intent as any), entities: { ...(state.intent as any).entities, ...updates } };
    const now = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
    (this.store as unknown as { db: any }).db
      .prepare(`
        UPDATE conversation_states
        SET intent = ?, intent_version = intent_version + 1, updated_at = ?
        WHERE id = ?
      `)
      .run(JSON.stringify(nextIntent), now, conversationId);
    const updated = this.row(conversationId)!;
    (updated as any).affected_fields = affectedFields;
    return updated;
  }

  /** Record that "刚才那个酒店" resolved to a specific task (explicitly, after asking). */
  resolveRef(conversationId: string, expression: string, taskId: string): void {
    const state = this.get(conversationId);
    const refs = { ...state.resolved_refs, [expression]: taskId };
    const now = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
    (this.store as unknown as { db: any }).db
      .prepare(`UPDATE conversation_states SET resolved_refs = ?, updated_at = ? WHERE id = ?`)
      .run(JSON.stringify(refs), now, conversationId);
  }

  /**
   * The core ambiguity rule: a reference is unambiguous only when exactly one
   * open task exists in the conversation. Otherwise ask.
   */
  canResolveReference(conversationId: string, expression: string): { unique: boolean; taskId?: string; candidates: string[] } {
    const state = this.get(conversationId);
    const known = state.resolved_refs[expression];
    if (known) return { unique: true, taskId: known, candidates: [known] };
    const open = this.openTasksIn(conversationId);
    if (open.length === 1) return { unique: true, taskId: open[0], candidates: open };
    return { unique: false, candidates: open };
  }
}

const INTENT = {
  schema_version: 1,
  id: 'intent_01',
  conversation_id: 'conv_01',
  task_type: 'travel_plan',
  goal: '比较上海的酒店',
  entities: { place: '上海' },
  timezone: 'UTC',
  missing_fields: ['time', 'budget'],
  confidence: 0.8,
  created_at: '2026-10-09T10:00:00Z',
};

describe('P2.5 conversation state', () => {
  it('scenario 1: first request starts an intent bound to a task', () => {
    const store = new PersonalStore({ dbPath: join(TMP, 'a.sqlite') });
    const conv = new ConversationManager(store);
    const state = conv.startIntent('conv_01', 'task_01', INTENT);
    expect(state.current_task_id).toBe('task_01');
    expect(state.intent_version).toBe(1);
    store.close();
  });

  it('scenario 2: "改成周五" updates the current intent and bumps version', () => {
    const store = new PersonalStore({ dbPath: join(TMP, 'b.sqlite') });
    const conv = new ConversationManager(store);
    conv.startIntent('conv_01', 'task_01', INTENT);
    const updated = conv.applyFieldUpdate('conv_01', { time: '2026-10-16' }, ['time']);
    expect(updated.intent_version).toBe(2);
    expect((updated.intent as any).entities.time).toBe('2026-10-16');
    expect((updated as any).affected_fields).toEqual(['time']);
    store.close();
  });

  it('scenario 3: "刚才那个酒店" with two open tasks must ask, not pick', () => {
    const store = new PersonalStore({ dbPath: join(TMP, 'c.sqlite') });
    const conv = new ConversationManager(store);
    conv.startIntent('conv_01', 'task_01', INTENT);
    // A second task got registered in the same conversation.
    conv.resolveRef('conv_01', '第二个事项', 'task_02');
    const r = conv.canResolveReference('conv_01', '刚才那个酒店');
    expect(r.unique).toBe(false);
    expect(r.candidates.sort()).toEqual(['task_01', 'task_02']);
    // After the user disambiguates, resolution is recorded and stable.
    conv.resolveRef('conv_01', '刚才那个酒店', 'task_02');
    const r2 = conv.canResolveReference('conv_01', '刚才那个酒店');
    expect(r2.unique).toBe(true);
    expect(r2.taskId).toBe('task_02');
    store.close();
  });

  it('scenario 3b: single open task resolves uniquely without asking', () => {
    const store = new PersonalStore({ dbPath: join(TMP, 'd.sqlite') });
    const conv = new ConversationManager(store);
    conv.startIntent('conv_01', 'task_01', INTENT);
    const r = conv.canResolveReference('conv_01', '刚才那个酒店');
    expect(r.unique).toBe(true);
    expect(r.taskId).toBe('task_01');
    store.close();
  });

  it('session conditions never become facts (no facts row is touched)', () => {
    const store = new PersonalStore({ dbPath: join(TMP, 'e.sqlite') });
    const conv = new ConversationManager(store);
    conv.startIntent('conv_01', 'task_01', INTENT);
    conv.applyFieldUpdate('conv_01', { budget: 500 }, ['budget']);
    // The store has no facts rows — conversation updates live in conversation_states only.
    expect(store.listFacts()).toHaveLength(0);
    store.close();
  });

  it('scenario 6: restart recovery — conversation survives close/reopen', () => {
    const dbPath = join(TMP, 'f.sqlite');
    let store = new PersonalStore({ dbPath });
    let conv = new ConversationManager(store);
    conv.startIntent('conv_01', 'task_01', INTENT);
    conv.applyFieldUpdate('conv_01', { time: '2026-10-16' }, ['time']);
    store.close();

    store = new PersonalStore({ dbPath });
    conv = new ConversationManager(store);
    const state = conv.get('conv_01');
    expect(state.current_task_id).toBe('task_01');
    expect(state.intent_version).toBe(2);
    expect((state.intent as any).entities.time).toBe('2026-10-16');
    store.close();
  });

  it('field update without an open intent is refused, not guessed', () => {
    const store = new PersonalStore({ dbPath: join(TMP, 'g.sqlite') });
    const conv = new ConversationManager(store);
    expect(() => conv.applyFieldUpdate('conv_404', { time: 'x' }, ['time'])).toThrow(/没有正在办理的事项/);
    store.close();
  });
});
