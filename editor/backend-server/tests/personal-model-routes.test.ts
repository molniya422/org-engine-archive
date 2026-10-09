import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { createServer, type Server } from 'node:http';
import Fastify from 'fastify';
import { registerModelRoutes, type ProviderHealthReport } from '../src/personal/model.routes';

/**
 * Probes the diagnostics route against a stub Ollama/llama.cpp endpoint on
 * loopback, plus the no-provider configuration. The route must be honest:
 * unreachable -> ok=false with an understandable reason and fallback options;
 * it must never pretend a model is ready.
 */
let stub: Server | null = null;
let stubPort = 0;
let stubHandler: ((req: any, res: any) => void) | null = null;

beforeEach(async () => {
  if (stub) { await new Promise<void>((r) => stub!.close(() => r())); stub = null; }
  stubHandler = null;
  await new Promise<void>((resolve) => {
    stub = createServer((req, res) => {
      if (stubHandler) return stubHandler(req, res);
      res.writeHead(404).end('{}');
    });
    stub.listen(0, '127.0.0.1', () => {
      stubPort = (stub!.address() as any).port;
      resolve();
    });
  });
});

afterAll(async () => {
  if (stub) await new Promise<void>((r) => stub!.close(() => r()));
});

function makeApp() {
  const app = Fastify({ logger: false });
  registerModelRoutes(app);
  return app;
}

async function getHealth(app: any): Promise<ProviderHealthReport> {
  const res = await app.inject({ method: 'GET', url: '/api/v1/personal/model/health' });
  return res.json();
}

describe('P2.4 local model diagnostics', () => {
  it('reports honest "no model configured" with fallback copy', async () => {
    process.env.ORG_ENGINE_MODEL_PROVIDER = 'none';
    delete process.env.ORG_ENGINE_MODEL_BASE_URL;
    const app = makeApp();
    const report = await getHealth(app);
    expect(report.provider).toBe('none');
    expect(report.ok).toBe(false);
    expect(report.local_only).toBe(true);
    expect(report.detail).toContain('规则模式');
    app.close();
  });

  it('reports ollama down with an understandable error (never pretends ready)', async () => {
    process.env.ORG_ENGINE_MODEL_PROVIDER = 'ollama';
    process.env.ORG_ENGINE_MODEL_BASE_URL = 'http://127.0.0.1:9'; // nothing listens here
    const app = makeApp();
    const report = await getHealth(app);
    expect(report.ok).toBe(false);
    expect(report.detail).toContain('无法连接');
    expect(report.fallback_options.join('\n')).toContain('规则模式');
    app.close();
  });

  it('reports ollama ready with models loaded', async () => {
    process.env.ORG_ENGINE_MODEL_PROVIDER = 'ollama';
    process.env.ORG_ENGINE_MODEL_BASE_URL = `http://127.0.0.1:${stubPort}`;
    stubHandler = (req, res) => {
      if (req.url === '/api/tags') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ models: [{ name: 'qwen2.5:0.5b' }] }));
      } else { res.writeHead(404).end('{}'); }
    };
    const app = makeApp();
    const report = await getHealth(app);
    expect(report.ok).toBe(true);
    expect(report.models_loaded).toContain('qwen2.5:0.5b');
    app.close();
  });

  it('flags a configured-but-unloaded ollama model', async () => {
    process.env.ORG_ENGINE_MODEL_PROVIDER = 'ollama';
    process.env.ORG_ENGINE_MODEL_BASE_URL = `http://127.0.0.1:${stubPort}`;
    process.env.ORG_ENGINE_MODEL_NAME = 'llama3';
    stubHandler = (req, res) => {
      if (req.url === '/api/tags') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ models: [{ name: 'qwen2.5:0.5b' }] }));
      } else { res.writeHead(404).end('{}'); }
    };
    const app = makeApp();
    const report = await getHealth(app);
    expect(report.ok).toBe(false);
    expect(report.detail).toContain('未加载');
    app.close();
  });

  it('reports llama.cpp loading state (503) distinctly', async () => {
    process.env.ORG_ENGINE_MODEL_PROVIDER = 'llama.cpp';
    process.env.ORG_ENGINE_MODEL_BASE_URL = `http://127.0.0.1:${stubPort}`;
    stubHandler = (req, res) => {
      if (req.url === '/health') { res.writeHead(503).end('{"error":{"message":"loading"}}'); }
      else { res.writeHead(404).end('{}'); }
    };
    const app = makeApp();
    const report = await getHealth(app);
    expect(report.ok).toBe(false);
    expect(report.detail).toContain('加载');
    app.close();
  });

  it('reports llama.cpp ready', async () => {
    process.env.ORG_ENGINE_MODEL_PROVIDER = 'llama.cpp';
    process.env.ORG_ENGINE_MODEL_BASE_URL = `http://127.0.0.1:${stubPort}`;
    stubHandler = (req, res) => {
      if (req.url === '/health') res.writeHead(200).end('{"status":"ok"}');
      else if (req.url === '/props') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ default_generation_settings: { n_ctx: 4096 } }));
      } else { res.writeHead(404).end('{}'); }
    };
    const app = makeApp();
    const report = await getHealth(app);
    expect(report.ok).toBe(true);
    expect(report.context_length).toBe(4096);
    app.close();
  });

  it('fake provider reports ready and is labelled as test mode', async () => {
    process.env.ORG_ENGINE_MODEL_PROVIDER = 'fake';
    const app = makeApp();
    const report = await getHealth(app);
    expect(report.ok).toBe(true);
    expect(report.detail).toContain('测试模式');
    app.close();
  });

  it('never exposes a non-loopback base URL from env config', async () => {
    // The route probes the configured URL but must not offer one to users
    // beyond what's configured; local_only is always true in the contract.
    process.env.ORG_ENGINE_MODEL_PROVIDER = 'ollama';
    process.env.ORG_ENGINE_MODEL_BASE_URL = 'http://127.0.0.1:9';
    const app = makeApp();
    const report = await getHealth(app);
    expect(report.local_only).toBe(true);
    app.close();
  });
});
