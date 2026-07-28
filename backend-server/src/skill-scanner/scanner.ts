import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { parseSkillMetadata, SkillMeta } from './parser';

export const BUILTIN_AGENT_TYPES = [
  'general-purpose', 'Explore', 'Plan', 'code-reviewer',
  'statusline-setup',
];

export interface ScanResult {
  skills: SkillMeta[];
  agentTypes: string[];
  errors: { path: string; reason: string }[];
}

export function scanSkills(extraPaths: string[] = []): ScanResult {
  const skills: SkillMeta[] = [];
  const errors: { path: string; reason: string }[] = [];
  const scanDirs = [join(homedir(), '.claude', 'skills'), ...extraPaths].filter(p => existsSync(p) && statSync(p).isDirectory());
  const seenNames = new Set<string>();

  for (const dir of scanDirs) {
    for (const entry of readdirSync(dir)) {
      const skillDir = join(dir, entry);
      if (!statSync(skillDir).isDirectory()) continue;
      const skillFile = join(skillDir, 'SKILL.md');
      if (!existsSync(skillFile)) continue;
      try {
        const meta = parseSkillMetadata(skillFile, readFileSync(skillFile, 'utf-8'));
        if (meta) {
          if (seenNames.has(meta.name)) { errors.push({ path: skillFile, reason: `Duplicate name: ${meta.name}` }); continue; }
          seenNames.add(meta.name); skills.push(meta);
        } else errors.push({ path: skillFile, reason: 'Invalid frontmatter' });
      } catch (e) { errors.push({ path: skillFile, reason: String(e) }); }
    }
  }
  return { skills, agentTypes: [...BUILTIN_AGENT_TYPES], errors };
}
