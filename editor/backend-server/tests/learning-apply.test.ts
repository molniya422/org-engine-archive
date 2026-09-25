import { describe, it, expect, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { OrgConfigStore } from '../src/org-config/store';
import { applyProposal, nextStatus, revertProposal } from '../src/learning/apply';

// Fixture passes org-config.schema.json (v2.0: requires version/org/budget;
// role id `^[a-z][a-z0-9]*\.[a-z][a-z0-9_]*$`, bound_skills minItems 1).
const ORG = {
  version: '2.0',
  org: {
    name: 't',
    departments: [
      { name: 'QA', roles: [{ id: 'qa.lead', name: 'lead', agentType: 'g', bound_skills: ['verification-before-completion'] }] },
      { name: 'FE', roles: [{ id: 'fe.p', name: 'p', agentType: 'g', bound_skills: ['dpa'] }] },
    ],
    contracts: [{ key: 'ui', owner_dept: 'FE', version: '1' }],
  },
  budget: {},
};

let home = '';
afterEach(() => {
  delete process.env.ORG_ENGINE_HOME;
  if (home) { rmSync(home, { recursive: true, force: true }); home = ''; }
});

function git(args: string[], cwd: string): string {
  return execFileSync('git', args, { cwd, encoding: 'utf-8' });
}

function setup(): { orgsDir: string } {
  home = join(process.cwd(), '.tmp-test', Math.random().toString(36).slice(2));
  process.env.ORG_ENGINE_HOME = home;
  mkdirSync(join(home, 'orgs'), { recursive: true });
  const store = new OrgConfigStore();
  store.save('t', ORG);  // validates + writes via yaml-io
  // 组织仓库基线:先 commit 一次,revert 才能撤销 apply 那层而非删掉整个文件
  const orgsDir = join(home, 'orgs');
  git(['init'], orgsDir);
  git(['add', '.'], orgsDir);
  git(['-c', 'user.name=org-engine', '-c', 'user.email=learning@org-engine',
       'commit', '-m', 'baseline'], orgsDir);
  return { orgsDir };
}

describe('applyProposal', () => {
  it('add_role adds a role and commits', () => {
    const { orgsDir } = setup();
    const store = new OrgConfigStore();
    const proposal: any = {
      id: 'p1', org_ref: 't', rule: 'dispatch_review', status: 'proposed',
      changes: [{ op: 'add_role', dept: 'QA', role: { id: 'qa.r', name: 'r', agentType: 'g', bound_skills: ['pr-review'] } }],
    };
    const out = applyProposal(store, orgsDir, proposal);
    expect(out.status).toBe('applied');
    expect(out.applied_commit).toMatch(/^[0-9a-f]{7,}$/);
    const saved: any = store.get('t');
    expect(saved.org.departments[0].roles).toHaveLength(2);
    expect(saved.org.departments[0].roles[1].id).toBe('qa.r');
  });

  it('rebind_skill swaps bound skill', () => {
    const { orgsDir } = setup();
    const store = new OrgConfigStore();
    applyProposal(store, orgsDir, { id: 'p2', org_ref: 't', status: 'proposed',
      changes: [{ op: 'rebind_skill', skill: 'dpa', target: 'redesign-skill' }] } as any);
    const saved: any = store.get('t');
    expect(saved.org.departments[1].roles[0].bound_skills).toEqual(['redesign-skill']);
  });

  it('unbind_skill prunes role, and empty dept (bounds minItems 1)', () => {
    const { orgsDir } = setup();
    const store = new OrgConfigStore();
    applyProposal(store, orgsDir, { id: 'p4', org_ref: 't', status: 'proposed',
      changes: [{ op: 'unbind_skill', skill: 'dpa' }] } as any);
    const saved: any = store.get('t');
    // schema: bound_skills minItems 1 + departments minItems 1 →
    // 解绑后无技能的角色被移除,且空的 FE 部门被剪除,只剩 QA
    const allIds = saved.org.departments.flatMap((d: any) => (d.roles ?? []).map((r: any) => r.id));
    expect(allIds).not.toContain('fe.p');
    expect(saved.org.departments.map((d: any) => d.name)).toEqual(['QA']);
  });

  it('bump_contract increments version', () => {
    const { orgsDir } = setup();
    const store = new OrgConfigStore();
    applyProposal(store, orgsDir, { id: 'p3', org_ref: 't', status: 'proposed',
      changes: [{ op: 'bump_contract', contract: 'ui' }] } as any);
    const saved: any = store.get('t');
    expect(saved.org.contracts[0].version).toBe('2');
  });
});
describe('proposal state machine', () => {
  it('valid transitions', () => {
    expect(nextStatus('proposed', 'approve')).toBe('applied');
    expect(nextStatus('proposed', 'reject')).toBe('rejected');
    expect(nextStatus('applied', 'revert')).toBe('reverted');
  });
  it('invalid transitions throw', () => {
    expect(() => nextStatus('applied', 'approve')).toThrow();
    expect(() => nextStatus('proposed', 'revert')).toThrow();
    expect(() => nextStatus('rejected', 'approve')).toThrow();
  });
});

describe('revertProposal', () => {
  it('reverts an applied proposal via git', () => {
    const { orgsDir } = setup();
    const store = new OrgConfigStore();
    const proposal: any = {
      id: 'p-rev', org_ref: 't', rule: 'x', status: 'proposed',
      changes: [{ op: 'add_role', dept: 'QA', role: { id: 'qa.rr', name: 'rr', agentType: 'g', bound_skills: ['pr-review'] } }],
    };
    const applied = applyProposal(store, orgsDir, proposal);
    expect(applied.status).toBe('applied');
    const reverted = revertProposal(store, orgsDir, applied);
    expect(reverted.status).toBe('reverted');
    expect(reverted.reverted_commit).toMatch(/^[0-9a-f]{7,}$/);
    const saved: any = store.get('t');
    expect(saved.org.departments[0].roles.map((r: any) => r.id)).not.toContain('qa.rr');
  });

  it('refuses to revert a non-applied proposal', () => {
    const { orgsDir } = setup();
    const store = new OrgConfigStore();
    expect(() => revertProposal(store, orgsDir, { id: 'x', org_ref: 't', status: 'proposed' } as any)).toThrow();
  });

  it('refuses to revert a stale commit (not HEAD)', () => {
    const { orgsDir } = setup();
    const store = new OrgConfigStore();
    const p1: any = { id: 'p1', org_ref: 't', rule: 'x', status: 'proposed', changes: [{ op: 'add_role', dept: 'QA', role: { id: 'qa.a', name: 'a', agentType: 'g', bound_skills: ['pr-review'] } }] };
    const p2: any = { id: 'p2', org_ref: 't', rule: 'x', status: 'proposed', changes: [{ op: 'add_role', dept: 'QA', role: { id: 'qa.b', name: 'b', agentType: 'g', bound_skills: ['pr-review'] } }] };
    const a1 = applyProposal(store, orgsDir, p1);
    applyProposal(store, orgsDir, p2);          // HEAD 现在是 p2 的 commit
    expect(() => revertProposal(store, orgsDir, a1)).toThrow();
  });
});
