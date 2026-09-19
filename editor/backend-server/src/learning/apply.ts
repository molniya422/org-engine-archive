import { execFileSync } from 'node:child_process';
import { OrgConfigStore } from '../org-config/store';

interface Change { op: string; [k: string]: unknown }
export interface Proposal {
  id: string; org_ref: string; rule: string;
  changes: Change[]; evidence: unknown[]; rationale: string;
  status: string; applied_commit?: string;
}

function git(args: string[], cwd: string): string {
  return execFileSync('git', args, { cwd, encoding: 'utf-8' });
}

export function applyProposal(
  store: OrgConfigStore, orgsDir: string, proposal: Proposal
): Proposal {
  const org: any = store.get(proposal.org_ref);
  if (!org) throw new Error(`org not found: ${proposal.org_ref}`);
  const depts: any[] = org.org.departments;
  for (const c of proposal.changes) {
    if (c.op === 'add_role') {
      const dept = depts.find(d => d.name === c.dept);
      if (!dept) throw new Error(`dept not found: ${c.dept}`);
      dept.roles = dept.roles ?? [];
      dept.roles.push(c.role);
    } else if (c.op === 'rebind_skill') {
      for (const d of depts) for (const r of (d.roles ?? [])) {
        if ((r.bound_skills ?? []).includes(c.skill)) {
          r.bound_skills = r.bound_skills.filter((s: string) => s !== c.skill);
          if (c.target) r.bound_skills.push(c.target);
        }
      }
    } else if (c.op === 'unbind_skill') {
      for (const d of depts) {
        for (const r of (d.roles ?? [])) {
          r.bound_skills = (r.bound_skills ?? []).filter((s: string) => s !== c.skill);
        }
        // roles schema minItems 1 → 解绑后无剩余技能的角色移除
        d.roles = (d.roles ?? []).filter((r: any) => (r.bound_skills ?? []).length > 0);
      }
      // departments schema minItems 1 + roles minItems 1 → 空角色的部门一并剪除
      org.org.departments = org.org.departments.filter(
        (d: any) => (d.roles ?? []).length > 0,
      );
    } else if (c.op === 'bump_contract') {
      const ct = (org.org.contracts ?? []).find((x: any) => x.key === c.contract);
      if (ct) ct.version = String(Number(ct.version) + 1);
    } else {
      throw new Error(`unknown op: ${c.op}`);
    }
  }
  store.save(proposal.org_ref, org);   // schema 校验免费获得
  try { git(['init'], orgsDir); } catch { /* already a repo */ }
  git(['add', '.'], orgsDir);
  try {
    git(['-c', 'user.name=org-engine', '-c', 'user.email=learning@org-engine',
         'commit', '-m', `learning: apply ${proposal.id} (${proposal.rule})`], orgsDir);
  } catch { /* nothing to commit */ }
  proposal.status = 'applied';
  proposal.applied_commit = git(['rev-parse', '--short', 'HEAD'], orgsDir).trim();
  return proposal;
}