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
import { PersonalStore } from './personal/store';
import { EvidenceRepository } from './personal/evidence';
import { registerPersonalRoutes } from './personal/routes';
import { resolveDataPaths, assertWritableDataDir, firstRunInit } from './config';

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
  // CORS allowlist: the backend has no auth layer and holds org configs, runs and
  // (later) personal data, so it must not reflect arbitrary origins — `origin: true`
  // would let any website read localhost responses. Default to loopback dev
  // origins; override with ORG_ENGINE_ALLOWED_ORIGINS (comma-separated).
  const DEFAULT_ALLOWED_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173'];
  const allowedOrigins = new Set(
    (process.env.ORG_ENGINE_ALLOWED_ORIGINS?.trim()
      ? process.env.ORG_ENGINE_ALLOWED_ORIGINS.split(',').map(s => s.trim()).filter(Boolean)
      : DEFAULT_ALLOWED_ORIGINS),
  );
  await app.register(cors, {
    origin: (incoming, cb) => {
      // No Origin header: same-origin page, non-browser client (tests, CLI, MCP).
      if (!incoming) return cb(null, true);
      cb(null, allowedOrigins.has(incoming));
    },
  });
  await app.register(websocket);

  // Routes
  app.get('/api/v1/health', async () => ({ status: 'ok' }));
  registerOrgRoutes(app, store);
  const workflowStore = new WorkflowConfigStore();
  registerWorkflowRoutes(app, workflowStore);
  registerSkillRoutes(app, pool);
  registerRunRoutes(app, runManager, persistence);
  registerWsRoutes(app, runManager, persistence);
  registerMcpRoutes(app);
  registerTemplateRoutes(app);
  registerPlaybookRoutes(app);
  registerHealthRoutes(app);
  registerInsightsRoutes(app, join(homedir(), '.org-engine-editor', 'state'));

  // Learning loop: evolution events / report / proposals (approve mutates org yaml + commits)
  // P9.1 — 数据路径统一治理：Electron 已把 ORG_ENGINE_HOME 指向 userData；
  // 这里首次启动创建数据目录与权限说明，并拒绝把数据写进安装介质。
  const dataPaths = resolveDataPaths();
  assertWritableDataDir(dataPaths);
  const firstRun = firstRunInit(dataPaths);
  if (firstRun.created) console.log(`First run: data dir ready at ${dataPaths.userDataDir}`);
  const home = dataPaths.userDataDir;
  // __dirname 仅存在于 CJS bundle;ESM/dev 下退回 cwd(与 validator.ts 同一守卫)
  const here = typeof __dirname !== 'undefined' ? __dirname : process.cwd();
  const learningDir = resolveLearningDir(here, home, process.env.ORG_ENGINE_LEARNING_DIR);
  await app.register(learningRoutes, { learningDir, orgsDir: join(home, 'orgs') });

  // Personal domain (P1.2/P1.3/P1.4): facts/rules/tasks/evidence/traces.
  // Store lives under <home>/personal/personal.sqlite (WAL), workspace-relative
  // file evidence is resolved against the configured workspace root.
  const personalStore = new PersonalStore({ dbPath: dataPaths.personalDbPath });
  const personalEvidence = new EvidenceRepository(personalStore, process.env.ORG_ENGINE_WORKSPACE ?? process.cwd());
  registerPersonalRoutes(app, { store: personalStore, evidence: personalEvidence });

  // Expose store to health route via app decorator (typed)
  (app as any)._orgStore = store;

  // Try ports starting from startPort, increment on conflict.
  // Bind loopback by default: the backend has no auth layer, so listening on all
  // interfaces would expose org configs, runs and personal data to the LAN.
  // Set ORG_ENGINE_HOST to override deliberately.
  const host = process.env.ORG_ENGINE_HOST?.trim() || '127.0.0.1';
  let actualPort = startPort;
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      await app.listen({ port: actualPort, host });
      break;
    } catch (err: any) {
      if (err?.code === 'EADDRINUSE' || err?.message?.includes('EADDRINUSE')) {
        actualPort++;
        continue;
      }
      throw err;
    }
  }

  console.log(`Server on ${host}:${actualPort}`);
  return { app, port: actualPort };
}

// Auto-start when run directly (dev mode)
const isEntryPoint = process.argv[1] && (
  process.argv[1].endsWith('server.ts') || process.argv[1].endsWith('server.js')
);
if (isEntryPoint) {
  startServer();
}
