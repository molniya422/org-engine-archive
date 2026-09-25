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

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const DEFAULT_MAX_AUTO_PER_WINDOW = 3;
export const WINDOW_DAYS = 7;

interface PolicyState {
  window_start: string;
  auto_applied: number;
  max_auto_per_window: number;
  breaker_tripped: boolean;
}

function freshState(): PolicyState {
  return {
    window_start: new Date().toISOString(),
    auto_applied: 0,
    max_auto_per_window: DEFAULT_MAX_AUTO_PER_WINDOW,
    breaker_tripped: false,
  };
}

/** 预算 + 熔断看护。失败即关(fail-closed):state 损坏 → 禁止自动应用。 */
export class AutoApplyPolicy {
  constructor(private readonly learningDir: string) {}

  private statePath(): string { return join(this.learningDir, 'autonomy-state.json'); }

  private read(): PolicyState {
    const p = this.statePath();
    try {
      if (!existsSync(p)) return freshState();
      const s = JSON.parse(readFileSync(p, 'utf-8')) as PolicyState;
      if (typeof s.max_auto_per_window !== 'number' || typeof s.auto_applied !== 'number') {
        return { ...freshState(), breaker_tripped: true };
      }
      // 窗口滚动:超过 7 天重置
      const start = new Date(s.window_start).getTime();
      if (Number.isFinite(start) && Date.now() - start > WINDOW_DAYS * 24 * 3600 * 1000) {
        return freshState();
      }
      return s;
    } catch {
      return { ...freshState(), breaker_tripped: true };
    }
  }

  allow(): boolean {
    const s = this.read();
    return !s.breaker_tripped && s.auto_applied < s.max_auto_per_window;
  }

  record(): PolicyState {
    const s = this.read();
    s.auto_applied += 1;
    if (s.auto_applied >= s.max_auto_per_window) s.breaker_tripped = true;
    mkdirSync(this.learningDir, { recursive: true });
    writeFileSync(this.statePath(), JSON.stringify(s, null, 2), 'utf-8');
    return s;
  }
}