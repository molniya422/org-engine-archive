import type { FastifyInstance } from 'fastify';
import { listTemplates, getTemplate, createUserTemplate, deleteTemplate } from './template-engine';

export function registerTemplateRoutes(app: FastifyInstance): void {
  app.get('/api/v1/templates', async (req) => {
    const { category } = req.query as { category?: string };
    return listTemplates(category);
  });

  app.get('/api/v1/templates/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const t = getTemplate(id);
    if (!t) return reply.status(404).send({ error: 'Template not found' });
    return t;
  });

  app.post('/api/v1/templates', async (req) => {
    const body = req.body as Partial<import('./template-engine').WorkflowTemplate>;
    return createUserTemplate(body);
  });

  app.delete('/api/v1/templates/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!deleteTemplate(id)) return reply.status(404).send({ error: 'Template not found' });
    return { success: true };
  });
}
