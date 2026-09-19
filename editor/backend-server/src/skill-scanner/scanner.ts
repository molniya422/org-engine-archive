import { readFileSync, existsSync, readdirSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { parseSkillMetadata, SkillMeta } from './parser';

export const BUILTIN_AGENT_TYPES = [
  'general-purpose', 'Explore', 'Plan', 'code-reviewer',
  'statusline-setup', 'sonnet', 'opus', 'haiku', 'fable',
];

export interface ScanResult {
  skills: SkillMeta[];
  agentTypes: string[];
  errors: { path: string; reason: string }[];
}

// ── Persisted scan paths ──────────────────────────────────────────────────
// The packaged app restarts the backend on every launch, so any path added via
// "Rescan" was previously lost. Persist to ~/.org-engine-editor/settings.json.
const SETTINGS_DIR = join(homedir(), '.org-engine-editor');
const SETTINGS_FILE = join(SETTINGS_DIR, 'settings.json');

export function loadPersistedSkillPaths(): string[] {
  try {
    if (!existsSync(SETTINGS_FILE)) return [];
    const raw = JSON.parse(readFileSync(SETTINGS_FILE, 'utf-8'));
    return Array.isArray(raw?.skill_paths)
      ? raw.skill_paths.filter((p: unknown): p is string => typeof p === 'string')
      : [];
  } catch {
    return [];
  }
}

export function persistSkillPaths(paths: string[]): void {
  try {
    if (!existsSync(SETTINGS_DIR)) mkdirSync(SETTINGS_DIR, { recursive: true });
    const merged = Array.from(new Set([...loadPersistedSkillPaths(), ...paths]));
    writeFileSync(SETTINGS_FILE, JSON.stringify({ skill_paths: merged }, null, 2), 'utf-8');
  } catch {
    /* best-effort persistence */
  }
}

function splitEnvPaths(): string[] {
  return (process.env.OE_SKILL_PATHS || '')
    .split(/[;,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function scanSkills(extraPaths: string[] = []): ScanResult {
  const skills: SkillMeta[] = [];
  const errors: { path: string; reason: string }[] = [];
  const scanDirs = Array.from(new Set([
    join(homedir(), '.claude', 'skills'),
    ...splitEnvPaths(),
    ...loadPersistedSkillPaths(),
    ...extraPaths,
  ])).filter((p) => existsSync(p) && statSync(p).isDirectory());
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
