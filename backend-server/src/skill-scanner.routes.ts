import { FastifyInstance } from 'fastify';
import { SkillPool } from './skill-scanner/pool';

export function registerSkillRoutes(app: FastifyInstance, pool: SkillPool): void {
  app.get('/api/v1/skills', async () => pool.scan());
  app.post('/api/v1/skills/scan', async (req: any) => {
    const extraPaths = req.body?.extra_paths ?? [];
    for (const p of extraPaths) pool.addScanPath(p);
    pool.invalidate();
    return pool.scan();
  });
}
