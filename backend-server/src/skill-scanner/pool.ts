import { scanSkills, BUILTIN_AGENT_TYPES } from './scanner';
import type { SkillMeta } from './parser';

export interface SkillPoolEntry {
  name: string;
  description: string;
  source: 'skill' | 'agentType';
  path?: string;
}

export class SkillPool {
  private cache: SkillPoolEntry[] | null = null;
  private extraPaths: string[] = [];

  addScanPath(path: string): void { this.extraPaths.push(path); this.cache = null; }

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
