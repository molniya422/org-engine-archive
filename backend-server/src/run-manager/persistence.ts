import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { RunState } from './manager';

const RUNS_DIR = join(homedir(), '.org-engine-editor', 'runs');

export class RunPersistence {
  async save(runId: string, state: RunState): Promise<void> {
    const dir = join(RUNS_DIR, runId);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'state.json'), JSON.stringify(state, null, 2), 'utf-8');
  }

  async load(runId: string): Promise<RunState | null> {
    const path = join(RUNS_DIR, runId, 'state.json');
    if (!existsSync(path)) return null;
    return JSON.parse(readFileSync(path, 'utf-8'));
  }

  list(): string[] {
    if (!existsSync(RUNS_DIR)) return [];
    return readdirSync(RUNS_DIR).filter(f => existsSync(join(RUNS_DIR, f, 'state.json')));
  }
}
