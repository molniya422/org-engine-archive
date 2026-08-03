import type { FastifyInstance } from 'fastify';
import { listPlaybooks, getPlaybook, applyPlaybook } from './engine';
import type { WorkflowPlaybook } from './types';

interface PlaybookSummary {
  id: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  stageCount: number;
  recommendedFor: string[];
}

function summarize(p: WorkflowPlaybook): PlaybookSummary {
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    category: p.category,
    tags: p.tags,
    stageCount: p.stages.length,
    recommendedFor: p.recommendedFor,
  };
}

export function registerPlaybookRoutes(app: FastifyInstance): void {
  app.get('/api/v1/playbooks', async (req) => {
    const { category } = req.query as { category?: string };
    return listPlaybooks(category).map(summarize);
  });

  app.get('/api/v1/playbooks/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const p = getPlaybook(id);
    if (!p) return reply.status(404).send({ error: 'Playbook not found' });
    return p;
  });

  app.post('/api/v1/playbooks/:id/apply', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as {
      mode: 'create_org' | 'apply_to_org' | 'workflow_only';
      orgId?: string;
      params?: Record<string, unknown>;
    };
    try {
      return await applyPlaybook(id, body.mode, body.params ?? {}, body.orgId);
    } catch (err: any) {
      return reply.status(404).send({ error: err.message });
    }
  });
}