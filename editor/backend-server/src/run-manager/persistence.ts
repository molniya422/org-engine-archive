import { mkdir, writeFile, readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { RunState } from './manager';

function runsDir(): string {
  return join(process.env.ORG_ENGINE_HOME ?? join(homedir(), '.org-engine-editor'), 'runs');
}

async function exists(path: string): Promise<boolean> {
  try { await stat(path); return true; }
  catch { return false; }
}

export class RunPersistence {
  async save(runId: string, state: RunState): Promise<void> {
    const dir = join(runsDir(), runId);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'state.json'), JSON.stringify(state, null, 2), 'utf-8');
  }

  async load(runId: string): Promise<RunState | null> {
    const path = join(runsDir(), runId, 'state.json');
    if (!(await exists(path))) return null;
    return JSON.parse(await readFile(path, 'utf-8'));
  }

  async list(): Promise<string[]> {
    if (!(await exists(runsDir()))) return [];
    const entries = await readdir(runsDir());
    const results: string[] = [];
    for (const f of entries) {
      if (await exists(join(runsDir(), f, 'state.json'))) results.push(f);
    }
    return results;
  }
}
