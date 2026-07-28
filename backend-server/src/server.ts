import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import { registerOrgRoutes } from './org-config.routes';
import { registerSkillRoutes } from './skill-scanner.routes';
import { registerRunRoutes } from './run.routes';
import { registerWsRoutes } from './ws-bridge/routes';
import { OrgConfigStore } from './org-config/store';
import { SkillPool } from './skill-scanner/pool';
import { OrchestratorClient } from './orchestrator-adapter/client';
import { RunManager } from './run-manager/manager';
import { RunPersistence } from './run-manager/persistence';

const app = Fastify({ logger: true });
const port = parseInt(process.env.PORT || '5172', 10);

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

app.listen({ port }).then(() => console.log(`Server on :${port}`));
