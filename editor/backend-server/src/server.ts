import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import type { FastifyInstance } from 'fastify';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { registerOrgRoutes } from './org-config.routes';
import { registerSkillRoutes } from './skill-scanner.routes';
import { registerRunRoutes } from './run.routes';
import { registerWsRoutes } from './ws-bridge/routes';
import { registerMcpRoutes } from './mcp/routes.js';
import { registerTemplateRoutes } from './templates/index.js';
import { registerPlaybookRoutes } from './playbooks/routes.js';
import './playbooks/built-in/index';
import { registerHealthRoutes } from './health/routes.js';
import { OrgConfigStore } from './org-config/store';
import { WorkflowConfigStore } from './workflow-config/store';
import { registerWorkflowRoutes } from './workflow.routes';
import { registerInsightsRoutes } from './insights.routes';
import { learningRoutes } from './learning/routes';
import { resolveLearningDir } from './learning/paths';
import { SkillPool } from './skill-scanner/pool';
import { OrchestratorClient } from './orchestrator-adapter/client';
import { RunManager } from './run-manager/manager';
import { RunPersistence } from './run-manager/persistence';

export interface ServerInfo {
  app: FastifyInstance;
  port: number;
}

export async function startServer(port?: number): Promise<ServerInfo> {
  const app = Fastify({ logger: false });
  const startPort = port ?? parseInt(process.env.PORT || '5172', 10);

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
  const workflowStore = new WorkflowConfigStore();
  registerWorkflowRoutes(app, workflowStore);
  registerSkillRoutes(app, pool);
  registerRunRoutes(app, runManager);
  registerWsRoutes(app, runManager, persistence);
  registerMcpRoutes(app);
  registerTemplateRoutes(app);
  registerPlaybookRoutes(app);
  registerHealthRoutes(app);
  registerInsightsRoutes(app, join(homedir(), '.org-engine-editor', 'state'));

  // Learning loop: evolution events / report / proposals (approve mutates org yaml + commits)
  const home = process.env.ORG_ENGINE_HOME ?? join(homedir(), '.org-engine-editor');
  // __dirname 仅存在于 CJS bundle;ESM/dev 下退回 cwd(与 validator.ts 同一守卫)
  const here = typeof __dirname !== 'undefined' ? __dirname : process.cwd();
  const learningDir = resolveLearningDir(here, home, process.env.ORG_ENGINE_LEARNING_DIR);
  await app.register(learningRoutes, { learningDir, orgsDir: join(home, 'orgs') });

  // Expose store to health route via app decorator (typed)
  (app as any)._orgStore = store;

  // Try ports starting from startPort, increment on conflict
  let actualPort = startPort;
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      await app.listen({ port: actualPort });
      break;
    } catch (err: any) {
      if (err?.code === 'EADDRINUSE' || err?.message?.includes('EADDRINUSE')) {
        actualPort++;
        continue;
      }
      throw err;
    }
  }

  console.log(`Server on :${actualPort}`);
  return { app, port: actualPort };
}

// Auto-start when run directly (dev mode)
const isEntryPoint = process.argv[1] && (
  process.argv[1].endsWith('server.ts') || process.argv[1].endsWith('server.js')
);
if (isEntryPoint) {
  startServer();
}
