import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import Fastify from 'fastify';
import { PersonalStore } from '../src/personal/store';
import { registerLearningRoutes } from '../src/personal/learning.routes';

// Windows rmSync on a directory whose SQLite handles just closed can EPERM;
// retry once after a short yield.
function rmRf(p: string): void {
  try {
    rmSync(p, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  } catch { /* best effort on Windows */ }
}

const TMP = join(process.cwd(), '.tmp-personal-learning-routes');

beforeEach(() => {
  rmRf(TMP);
  mkdirSync(TMP, { recursive: true });
});

afterAll(() => {
  rmRf(TMP);
});

const PROPOSAL = {
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

async function buildApp(dbPath: string) {
  const store = new PersonalStore({ dbPath });
  const app = Fastify({ logger: false });
  registerLearningRoutes(app, { store });
  await app.ready();
  return { app, store };
}

describe('P7.3 personal learning routes', () => {
  it('refuses to enable a version before the regression set passes', async () => {
    const dbPath = join(TMP, 'a.sqlite');
    const { app, store } = await buildApp(dbPath);
    store.saveLearningProposal(PROPOSAL);
    try {
      const approve = await app.inject({
        method: 'POST',
        url: '/api/v1/personal/learning/proposals/learning_01/approve',
        payload: { kind: 'rules', content: { when: { field: 'due' }, then: { value: '2026-10-20' } } },
      });
      expect(approve.statusCode).toBe(200);
      expect(approve.json().status).toBe('approved');

      const apply = await app.inject({
        method: 'POST',
        url: '/api/v1/personal/learning/proposals/learning_01/apply',
        payload: { eval_passed: false },
      });
      expect(apply.statusCode).toBe(409);

      // eval 通过后才能启用
      const apply2 = await app.inject({
        method: 'POST',
        url: '/api/v1/personal/learning/proposals/learning_01/apply',
        payload: { eval_passed: true, eval_report: 'passed' },
      });
      expect(apply2.statusCode).toBe(200);
      expect(apply2.json().status).toBe('applied');
    } finally {
      await app.close();
      store.close();
    }
  });

  it('apply is impossible before approve; rollback restores the previous version', async () => {
    const dbPath = join(TMP, 'b.sqlite');
    const { app, store } = await buildApp(dbPath);
    store.saveLearningProposal(PROPOSAL);
    try {
      // 未批准直接 apply → 409
      const early = await app.inject({
        method: 'POST',
        url: '/api/v1/personal/learning/proposals/learning_01/apply',
        payload: { eval_passed: true },
      });
      expect(early.statusCode).toBe(409);

      // v1（启用）→ v2（启用）→ 回滚 v2 恢复 v1
      const approve1 = await app.inject({
        method: 'POST',
        url: '/api/v1/personal/learning/proposals/learning_01/approve',
        payload: { kind: 'rules', content: { when: 'old' } },
      });
      expect(approve1.statusCode).toBe(200);
      await app.inject({
        method: 'POST',
        url: '/api/v1/personal/learning/proposals/learning_01/apply',
        payload: { eval_passed: true },
      });

      store.saveLearningProposal({ ...PROPOSAL, id: 'learning_02' });
      const approve2 = await app.inject({
        method: 'POST',
        url: '/api/v1/personal/learning/proposals/learning_02/approve',
        payload: { kind: 'rules', content: { when: 'new' } },
      });
      expect(approve2.statusCode).toBe(200);
      await app.inject({
        method: 'POST',
        url: '/api/v1/personal/learning/proposals/learning_02/apply',
        payload: { eval_passed: true },
      });

      const rollback = await app.inject({
        method: 'POST',
        url: '/api/v1/personal/learning/proposals/learning_02/rollback',
      });
      expect(rollback.statusCode).toBe(200);
      expect(rollback.json().status).toBe('reverted');
      expect(store.activeLearningVersion('rules')?.content).toEqual({ when: 'old' });
    } finally {
      await app.close();
      store.close();
    }
  });

  it('approve / apply / rollback statuses persist across restart (acceptance)', async () => {
    const dbPath = join(TMP, 'c.sqlite');
    {
      const { app, store } = await buildApp(dbPath);
      store.saveLearningProposal(PROPOSAL);
      await app.inject({
        method: 'POST',
        url: '/api/v1/personal/learning/proposals/learning_01/approve',
        payload: { kind: 'policy', content: { confirm: 'always' } },
      });
      await app.inject({
        method: 'POST',
        url: '/api/v1/personal/learning/proposals/learning_01/apply',
        payload: { eval_passed: true },
      });
      await app.close();
      store.close();
    }

    // 「重启」后：approved → applied 的状态都还在
    let reopened = new PersonalStore({ dbPath });
    let app2 = Fastify({ logger: false });
    registerLearningRoutes(app2, { store: reopened });
    await app2.ready();
    try {
      const list = await app2.inject({ method: 'GET', url: '/api/v1/personal/learning/proposals' });
      expect(list.json().proposals[0].status).toBe('applied');
      expect(reopened.activeLearningVersion('policy')?.status).toBe('enabled');
    } finally {
      await app2.close();
      reopened.close();
    }

    // 回滚 → reverted 状态同样在重启后保持一致
    {
      const { app, store } = await buildApp(dbPath);
      store.saveLearningProposal({ ...PROPOSAL, id: 'learning_03' });
      await app.inject({
        method: 'POST',
        url: '/api/v1/personal/learning/proposals/learning_03/approve',
        payload: { kind: 'policy', content: { confirm: 'v2' } },
      });
      await app.inject({
        method: 'POST',
        url: '/api/v1/personal/learning/proposals/learning_03/apply',
        payload: { eval_passed: true },
      });
      const rb = await app.inject({
        method: 'POST',
        url: '/api/v1/personal/learning/proposals/learning_03/rollback',
      });
      expect(rb.statusCode).toBe(200);
      await app.close();
      store.close();
    }

    reopened = new PersonalStore({ dbPath });
    const after = reopened.listLearningProposals();
    const statuses = Object.fromEntries(after.map((p) => [String(p.id), p.status]));
    expect(statuses['learning_01']).toBe('applied');
    expect(statuses['learning_03']).toBe('reverted');
    // 回滚后 active 是旧版本
    expect(reopened.activeLearningVersion('policy')?.content).toEqual({ confirm: 'always' });
    reopened.close();
  });

  it('reject keeps the proposal out of the active path without touching tasks', async () => {
    const dbPath = join(TMP, 'd.sqlite');
    const { app, store } = await buildApp(dbPath);
    store.saveLearningProposal(PROPOSAL);
    try {
      const reject = await app.inject({
        method: 'POST',
        url: '/api/v1/personal/learning/proposals/learning_01/reject',
      });
      expect(reject.statusCode).toBe(200);
      expect(store.getLearningProposal('learning_01')?.status).toBe('rejected');
      // 拒绝后不能 apply
      const apply = await app.inject({
        method: 'POST',
        url: '/api/v1/personal/learning/proposals/learning_01/apply',
        payload: { eval_passed: true },
      });
      expect(apply.statusCode).toBe(409);
      expect(store.activeLearningVersion('rules')).toBeNull();
    } finally {
      await app.close();
      store.close();
    }
  });
});
