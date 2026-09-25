/** 自治门控 — 风险分类与自动应用等级(唯一 owner,勿在 routes/apply 重复判定)。 */
export type Risk = 'low' | 'high';
export type AutonomyLevel = 'l1' | 'l2' | 'l3';

export const AUTONOMY_LEVELS: AutonomyLevel[] = ['l1', 'l2', 'l3'];

/** 结构 op 的风险分类:rebind_skill 仅改技能指针 → 低风险;其余结构变更高风险。 */
export const RISK_OPS: Record<string, Risk> = {
  rebind_skill: 'low',
  add_role: 'high',
  unbind_skill: 'high',
  bump_contract: 'high',
};

/** 低风险结构变更自动合并所需的最低自治等级(spec §6 表:L3 结构自治)。 */
export const AUTO_APPLY_LEVEL: AutonomyLevel = 'l3';

export interface ChangeLike { op: string; [k: string]: unknown }
export interface ProposalLike { changes: ChangeLike[] }

export function classifyProposal(proposal: ProposalLike): Risk {
  const ops = proposal.changes ?? [];
  if (ops.length === 0) return 'high';      // 空变更永不自动
  return ops.every(c => RISK_OPS[c.op] === 'low') ? 'low' : 'high';
}

export function canAutoApply(proposal: ProposalLike, level: AutonomyLevel): boolean {
  if (level !== AUTO_APPLY_LEVEL) return false;
  return classifyProposal(proposal) === 'low';
}