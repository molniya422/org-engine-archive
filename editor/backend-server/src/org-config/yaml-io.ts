import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync, unlinkSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { parse, stringify } from 'yaml';

function orgsDir(): string {
  return join(process.env.ORG_ENGINE_HOME ?? join(homedir(), '.org-engine-editor'), 'orgs');
}

function ensureDir(): string {
  const dir = orgsDir();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

export function readOrgConfig(id: string): unknown {
  const path = join(ensureDir(), `${id}.yaml`);
  if (!existsSync(path)) return null;
  return parse(readFileSync(path, 'utf-8'));
}

export function writeOrgConfig(id: string, data: unknown): void {
  const dir = ensureDir();
  const path = join(dir, `${id}.yaml`);
  const tmpPath = path + '.tmp';
  const yamlStr = stringify(data, { indent: 2, sortMapEntries: true, lineWidth: 120 });
  writeFileSync(tmpPath, yamlStr, 'utf-8');
  renameSync(tmpPath, path); // atomic on same filesystem
}

export function listOrgConfigs(): string[] {
  const dir = ensureDir();
  return readdirSync(dir).filter(f => f.endsWith('.yaml')).map(f => f.replace(/\.yaml$/, ''));
}

export function deleteOrgConfig(id: string): void {
  const path = join(ensureDir(), `${id}.yaml`);
  if (existsSync(path)) unlinkSync(path);
}

/** Read the raw YAML text for an org config (for export). */
export function readOrgConfigRaw(id: string): string | null {
  const path = join(ensureDir(), `${id}.yaml`);
  if (!existsSync(path)) return null;
  return readFileSync(path, 'utf-8');
}
