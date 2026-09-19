import { readdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { OrgConfigStore } from '../org-config/store';
import { applyProposal } from './apply';

export interface LearningOpts { learningDir: string; orgsDir: string }

async function readJsonl(path: string): Promise<unknown[]> {
  if (!existsSync(path)) return [];
  const out: unknown[] = [];
  for (const line of (await readFile(path, 'utf-8')).split('\n')) {
    const s = line.trim();
    if (!s) continue;
    try { out.push(JSON.parse(s)); } catch { /* skip bad line */ }
  }
  return out;
}

export async function learningRoutes(app: any, opts: LearningOpts) {
  const store = new OrgConfigStore();
  const eventsPath = join(opts.learningDir, 'events.jsonl');
  const proposalsDir = join(opts.learningDir, 'proposals');

  app.get('/api/learning/events', async () => readJsonl(eventsPath));

  app.get('/api/learning/report', async (_req: any, reply: any) => {
    const p = join(opts.learningDir, 'report.json');
    if (!existsSync(p)) return reply.code(404).send({ error: 'report not generated' });
    return JSON.parse(await readFile(p, 'utf-8'));
  });

  app.get('/api/learning/proposals', async () => {
    if (!existsSync(proposalsDir)) return [];
    const files = (await readdir(proposalsDir)).filter(f => f.endsWith('.json'));
    return Promise.all(files.map(f => readFile(join(proposalsDir, f), 'utf-8').then(JSON.parse)));
  });

  app.post('/api/learning/proposals/:id/reject', async (req: any, reply: any) => {
    const p = join(proposalsDir, `${req.params.id}.json`);
    if (!existsSync(p)) return reply.code(404).send({ error: 'proposal not found' });
    const proposal = JSON.parse(await readFile(p, 'utf-8'));
    proposal.status = 'rejected';
    await writeFile(p, JSON.stringify(proposal, null, 2), 'utf-8');
    return proposal;
  });

  app.post('/api/learning/proposals/:id/approve', async (req: any, reply: any) => {
    const p = join(proposalsDir, `${req.params.id}.json`);
    if (!existsSync(p)) return reply.code(404).send({ error: 'proposal not found' });
    const proposal = JSON.parse(await readFile(p, 'utf-8'));
    // fail-closed:非 proposed 状态一律拒绝,避免重复应用
    if (proposal.status !== 'proposed') {
      return reply.code(409).send({ error: `status is ${proposal.status}` });
    }
    const applied = applyProposal(store, opts.orgsDir, proposal);
    await writeFile(p, JSON.stringify(applied, null, 2), 'utf-8');
    return applied;
  });
}