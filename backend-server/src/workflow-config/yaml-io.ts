import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync, unlinkSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { parse, stringify } from 'yaml';

const BASE_DIR = join(homedir(), '.org-engine-editor', 'workflows');

function ensureDir(): string {
  if (!existsSync(BASE_DIR)) mkdirSync(BASE_DIR, { recursive: true });
  return BASE_DIR;
}

export function readWorkflowConfig(id: string): unknown {
  const path = join(ensureDir(), `${id}.yaml`);
  if (!existsSync(path)) return null;
  return parse(readFileSync(path, 'utf-8'));
}

/** Read the raw YAML text for a workflow config (for export). */
export function readWorkflowConfigRaw(id: string): string | null {
  const path = join(ensureDir(), `${id}.yaml`);
  if (!existsSync(path)) return null;
  return readFileSync(path, 'utf-8');
}

export function writeWorkflowConfig(id: string, data: unknown): void {
  const path = join(ensureDir(), `${id}.yaml`);
  const tmpPath = path + '.tmp';
  writeFileSync(tmpPath, stringify(data, { indent: 2, sortMapEntries: true, lineWidth: 120 }), 'utf-8');
  renameSync(tmpPath, path); // atomic on same filesystem
}

export function listWorkflowConfigs(): string[] {
  return readdirSync(ensureDir()).filter(f => f.endsWith('.yaml')).map(f => f.replace(/\.yaml$/, ''));
}

export function deleteWorkflowConfig(id: string): void {
  const path = join(ensureDir(), `${id}.yaml`);
  if (existsSync(path)) unlinkSync(path);
}
