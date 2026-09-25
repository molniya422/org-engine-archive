import { readdir, readFile, writeFile, appendFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { OrgConfigStore } from '../org-config/store';
import { applyProposal, nextStatus, revertProposal } from './apply';
import { AutoApplyPolicy, canAutoApply } from './autonomy';

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

async function appendEvent(path: string, ev: Record<string, unknown>): Promise<void> {
  await appendFile(path, JSON.stringify(ev) + '\n', 'utf-8');
}

function nowIso(): string { return new Date().toISOString(); }

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
    try { nextStatus(proposal.status, 'reject'); } catch (e: any) { return reply.code(409).send({ error: e.message }); }
    proposal.status = nextStatus(proposal.status, 'reject');
    await writeFile(p, JSON.stringify(proposal, null, 2), 'utf-8');
    return proposal;
  });

  app.post('/api/learning/proposals/:id/approve', async (req: any, reply: any) => {
    const p = join(proposalsDir, `${req.params.id}.json`);
    if (!existsSync(p)) return reply.code(404).send({ error: 'proposal not found' });
    const proposal = JSON.parse(await readFile(p, 'utf-8'));
    try { nextStatus(proposal.status, 'approve'); } catch (e: any) { return reply.code(409).send({ error: e.message }); }
    const applied = applyProposal(store, opts.orgsDir, proposal);
    await writeFile(p, JSON.stringify(applied, null, 2), 'utf-8');
    await appendEvent(eventsPath, {
      ts: nowIso(), run_id: 'approve', kind: 'proposal_applied',
      payload: { proposal_id: proposal.id, org_ref: proposal.org_ref, rule: proposal.rule },
    });
    return applied;
  });

  app.post('/api/learning/proposals/:id/revert', async (req: any, reply: any) => {
    const p = join(proposalsDir, `${req.params.id}.json`);
    if (!existsSync(p)) return reply.code(404).send({ error: 'proposal not found' });
    const proposal = JSON.parse(await readFile(p, 'utf-8'));
    try {
      const reverted = revertProposal(store, opts.orgsDir, proposal);
      await writeFile(p, JSON.stringify(reverted, null, 2), 'utf-8');
      await appendEvent(eventsPath, {
        ts: nowIso(), run_id: 'revert', kind: 'proposal_reverted',
        payload: { proposal_id: proposal.id, org_ref: proposal.org_ref, rule: proposal.rule },
      });
      return reverted;
    } catch (e: any) {
      return reply.code(409).send({ error: e.message });
    }
  });

  app.post('/api/learning/proposals/auto-apply', async (_req: any, reply: any) => {
    if (!existsSync(proposalsDir)) return { applied: 0, skipped: 0 };
    const files = (await readdir(proposalsDir)).filter(f => f.endsWith('.json'));
    const policy = new AutoApplyPolicy(opts.learningDir);
    let applied = 0, skipped = 0;
    for (const f of files) {
      const p = join(proposalsDir, f);
      const proposal = JSON.parse(await readFile(p, 'utf-8'));
      if (proposal.status !== 'proposed') continue;
      const org: any = store.get(proposal.org_ref);
      const level = org?.learning?.autonomy ?? 'l1';
      if (!canAutoApply(proposal, level) || !policy.allow()) { skipped++; continue; }
      policy.record();
      const done = applyProposal(store, opts.orgsDir, proposal);
      done.auto_applied = true;
      await writeFile(p, JSON.stringify(done, null, 2), 'utf-8');
      await appendEvent(eventsPath, {
        ts: nowIso(), run_id: 'auto-apply', kind: 'proposal_applied',
        payload: { proposal_id: proposal.id, org_ref: proposal.org_ref, rule: proposal.rule, auto_applied: true },
      });
      applied++;
    }
    return { applied, skipped };
  });
}