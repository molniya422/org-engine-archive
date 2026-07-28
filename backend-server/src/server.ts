import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import type { FastifyInstance } from 'fastify';
import { registerOrgRoutes } from './org-config.routes';
import { registerSkillRoutes } from './skill-scanner.routes';
import { registerRunRoutes } from './run.routes';
import { registerWsRoutes } from './ws-bridge/routes';
import { OrgConfigStore } from './org-config/store';
import { SkillPool } from './skill-scanner/pool';
import { OrchestratorClient } from './orchestrator-adapter/client';
import { RunManager } from './run-manager/manager';
import { RunPersistence } from './run-manager/persistence';

export async function startServer(port?: number): Promise<FastifyInstance> {
  const app = Fastify({ logger: true });
  const p = port ?? parseInt(process.env.PORT || '5172', 10);

  // Core services
  const store = new OrgConfigStore();
  const pool = new SkillPool();
  const client = new OrchestratorClient();
  const persistence = new RunPersistence();
  const runManager = new RunManager(client, persistence);

  // Plugins
  await app.register(cors, { origin: true });
  await app.register(websocket);

  // Routes
  app.get('/api/v1/health', async () => ({ status: 'ok' }));
  registerOrgRoutes(app, store);
  registerSkillRoutes(app, pool);
  registerRunRoutes(app, runManager);
  registerWsRoutes(app, runManager, persistence);

  await app.listen({ port: p });
  console.log(`Server on :${p}`);
  return app;
}

// Auto-start when run directly (dev mode)
const isEntryPoint = process.argv[1] && (
  process.argv[1].endsWith('server.ts') || process.argv[1].endsWith('server.js')
);
if (isEntryPoint) {
  startServer();
}
