import { mkdir, writeFile, readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { RunState } from './manager';

const RUNS_DIR = join(homedir(), '.org-engine-editor', 'runs');

async function exists(path: string): Promise<boolean> {
  try { await stat(path); return true; }
  catch { return false; }
}

export class RunPersistence {
  async save(runId: string, state: RunState): Promise<void> {
    const dir = join(RUNS_DIR, runId);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'state.json'), JSON.stringify(state, null, 2), 'utf-8');
  }

  async load(runId: string): Promise<RunState | null> {
    const path = join(RUNS_DIR, runId, 'state.json');
    if (!(await exists(path))) return null;
    return JSON.parse(await readFile(path, 'utf-8'));
  }

  async list(): Promise<string[]> {
    if (!(await exists(RUNS_DIR))) return [];
    const entries = await readdir(RUNS_DIR);
    const results: string[] = [];
    for (const f of entries) {
      if (await exists(join(RUNS_DIR, f, 'state.json'))) results.push(f);
    }
    return results;
  }
}
