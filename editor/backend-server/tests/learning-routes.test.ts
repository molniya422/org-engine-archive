import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import Fastify from 'fastify';
import { learningRoutes } from '../src/learning/routes';
import { OrgConfigStore } from '../src/org-config/store';

const ORG = {
  version: '2.0',
  org: {
    name: 't',
    departments: [
      { name: 'QA', roles: [{ id: 'qa.lead', name: 'lead', agentType: 'g', bound_skills: ['pr-review'] }] },
    ],
    contracts: [],
  },
  budget: {},
};

let home = '';
let learningDir = '';

beforeAll(() => {
  home = join(process.cwd(), '.tmp-routes', Math.random().toString(36).slice(2));
  process.env.ORG_ENGINE_HOME = home;
  learningDir = join(home, 'learning');
  mkdirSync(join(learningDir, 'proposals'), { recursive: true });

  // events.jsonl — 2 条
  const ev = (kind: string) => JSON.stringify({
    ts: '2026-09-11T00:00:00+00:00', run_id: 'r', kind, payload: {},
  }) + '\n';
  writeFileSync(join(learningDir, 'events.jsonl'), ev('skill_miss') + ev('dispatch_miss'));

  // report.json
  writeFileSync(join(learningDir, 'report.json'),
    JSON.stringify({ total_events: 2, counts: { skill_miss: 1, dispatch_miss: 1 } }));

  // 两个提案:一个可批准,一个已拒绝
  writeFileSync(join(learningDir, 'proposals', 'prop-ok.json'), JSON.stringify({
    id: 'prop-ok', org_ref: 't', rule: 'dispatch_review', evidence: [{}, {}, {}],
    rationale: 'r', status: 'proposed',
    changes: [{ op: 'add_role', dept: 'QA', role: { id: 'qa.r', name: 'r', agentType: 'g', bound_skills: ['pr-review'] } }],
  }));
  writeFileSync(join(learningDir, 'proposals', 'prop-done.json'), JSON.stringify({
    id: 'prop-done', org_ref: 't', rule: 'x', evidence: [], rationale: 'r', status: 'applied', changes: [],
  }));

  // 目标 org + git 基线(apply 在其上提交,revert 才能安全撤销)
  new OrgConfigStore().save('t', ORG);
  const orgsDir = join(home, 'orgs');
  execFileSync('git', ['init'], { cwd: orgsDir });
  execFileSync('git', ['add', '.'], { cwd: orgsDir });
  execFileSync('git', ['-c', 'user.name=org-engine', '-c', 'user.email=learning@org-engine', 'commit', '-m', 'baseline'], { cwd: orgsDir });
});

afterAll(() => {
  delete process.env.ORG_ENGINE_HOME;
  if (home) rmSync(home, { recursive: true, force: true });
});

function build() {
  const app = Fastify();
  app.register(learningRoutes, { learningDir, orgsDir: join(home, 'orgs') });
  return app;
}

describe('learning routes', () => {
  it('GET /events returns the JSONL stream', async () => {
    const app = build();
    const res = await app.inject({ method: 'GET', url: '/api/learning/events' });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload)).toHaveLength(2);
    await app.close();
  });

  it('GET /report returns the aggregated report', async () => {
    const app = build();
    const res = await app.inject({ method: 'GET', url: '/api/learning/report' });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload).total_events).toBe(2);
    await app.close();
  });

  it('GET /proposals lists all proposals', async () => {
    const app = build();
    const res = await app.inject({ method: 'GET', url: '/api/learning/proposals' });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload).map((p: any) => p.id).sort()).toEqual(['prop-done', 'prop-ok']);
    await app.close();
  });

  it('POST reject flips status', async () => {
    const app = build();
    const res = await app.inject({ method: 'POST', url: '/api/learning/proposals/prop-ok/reject' });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload).status).toBe('rejected');
    await app.close();
  });

  it('POST reject on missing proposal → 404', async () => {
    const app = build();
    const res = await app.inject({ method: 'POST', url: '/api/learning/proposals/nope/reject' });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('POST approve on already-applied proposal → 409 (fail-closed)', async () => {
    const app = build();
    const res = await app.inject({ method: 'POST', url: '/api/learning/proposals/prop-done/approve' });
    expect(res.statusCode).toBe(409);
    await app.close();
  });

  it('POST approve mutates org yaml and records a commit', async () => {
    const app = build();
    // 重新种一个 proposed 提案(前一个 reject 测试已改它)
    writeFileSync(join(learningDir, 'proposals', 'prop-go.json'), JSON.stringify({
      id: 'prop-go', org_ref: 't', rule: 'dispatch_review', evidence: [{}, {}, {}],
      rationale: 'r', status: 'proposed',
      changes: [{ op: 'add_role', dept: 'QA', role: { id: 'qa.r2', name: 'r2', agentType: 'g', bound_skills: ['pr-review'] } }],
    }));
    const res = await app.inject({ method: 'POST', url: '/api/learning/proposals/prop-go/approve' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.status).toBe('applied');
    expect(body.applied_commit).toMatch(/^[0-9a-f]{7,}$/);

    // 落盘的提案文件也更新了
    const persisted = JSON.parse(readFileSync(join(learningDir, 'proposals', 'prop-go.json'), 'utf-8'));
    expect(persisted.status).toBe('applied');

    // org yaml 真的出现了新角色
    const org: any = new OrgConfigStore().get('t');
    expect(org.org.departments[0].roles.map((r: any) => r.id)).toContain('qa.r2');
    await app.close();
  });
});
describe('learning revert + audit', () => {
  it('POST revert reverts an applied proposal', async () => {
    const app = build();
    writeFileSync(join(learningDir, 'proposals', 'prop-rev.json'), JSON.stringify({
      id: 'prop-rev', org_ref: 't', rule: 'x', status: 'proposed', evidence: [], rationale: 'r',
      changes: [{ op: 'add_role', dept: 'QA', role: { id: 'qa.z', name: 'z', agentType: 'g', bound_skills: ['pr-review'] } }],
    }));
    const ap = await app.inject({ method: 'POST', url: '/api/learning/proposals/prop-rev/approve' });
    expect(JSON.parse(ap.payload).status).toBe('applied');
    const rv = await app.inject({ method: 'POST', url: '/api/learning/proposals/prop-rev/revert' });
    expect(rv.statusCode).toBe(200);
    const body = JSON.parse(rv.payload);
    expect(body.status).toBe('reverted');
    expect(body.reverted_commit).toMatch(/^[0-9a-f]{7,}$/);
    const org: any = new OrgConfigStore().get('t');
    expect(org.org.departments[0].roles.map((r: any) => r.id)).not.toContain('qa.z');
    await app.close();
  });

  it('POST revert on proposed → 409 (fail-closed)', async () => {
    const app = build();
    writeFileSync(join(learningDir, 'proposals', 'prop-nv.json'), JSON.stringify({
      id: 'prop-nv', org_ref: 't', rule: 'x', status: 'proposed', changes: [], evidence: [], rationale: 'r',
    }));
    const res = await app.inject({ method: 'POST', url: '/api/learning/proposals/prop-nv/revert' });
    expect(res.statusCode).toBe(409);
    await app.close();
  });
});
