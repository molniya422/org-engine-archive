import { scanSkills, BUILTIN_AGENT_TYPES, loadPersistedSkillPaths, persistSkillPaths } from './scanner';
import type { SkillMeta } from './parser';

export interface SkillPoolEntry {
  name: string;
  description: string;
  source: 'skill' | 'agentType';
  path?: string;
}

export class SkillPool {
  private cache: SkillPoolEntry[] | null = null;
  private extraPaths: string[];

  constructor() {
    // Seed with persisted + env-configured paths so GET /skills works across restarts
    const envPaths = (process.env.OE_SKILL_PATHS || '')
      .split(/[;,]/).map((s) => s.trim()).filter(Boolean);
    this.extraPaths = Array.from(new Set([...loadPersistedSkillPaths(), ...envPaths]));
  }

  addScanPath(path: string): void { if (!this.extraPaths.includes(path)) this.extraPaths.push(path); this.cache = null; }

  /** Persist the current path list so a Rescan survives the next app launch. */
  persist(): void { persistSkillPaths(this.extraPaths); }

  scan(): SkillPoolEntry[] {
    if (this.cache) return this.cache;
    const result = scanSkills(this.extraPaths);
    this.cache = [
      ...result.skills.map(s => ({ name: s.name, description: s.description, source: 'skill' as const, path: s.path })),
      ...result.agentTypes.map(a => ({ name: a, description: `Built-in agent type: ${a}`, source: 'agentType' as const })),
    ];
    return this.cache;
  }

  invalidate(): void { this.cache = null; }
}
