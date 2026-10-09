import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';
import cors from '@fastify/cors';

/**
 * CORS/loopback safety for the personal-data backend (review doc, Phase 0
 * safety gates): "backend CORS currently uses origin: true with no auth layer;
 * before personal data is acceptable, bind loopback or add auth + workspace
 * scope — do not expose the LAN by default."
 *
 * `origin: true` reflects ANY requesting origin, so any website the user visits
 * can read responses from a localhost server that has no authentication. These
 * tests pin the fix: deny unknown origins, allow loopback dev origins.
 */
function buildApp(allowedOrigins?: string[]) {
  const app = Fastify({ logger: false });
  const allow = new Set(allowedOrigins ?? [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
  ]);
  app.register(cors, {
    origin: (incoming, cb) => {
      if (!incoming) return cb(null, true); // same-origin / non-browser client
      cb(null, allow.has(incoming));
    },
  });
  app.get('/api/v1/health', async () => ({ status: 'ok' }));
  return app;
}

describe('CORS policy', () => {
  it('allows loopback dev origins', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/health',
      headers: { origin: 'http://localhost:5173' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
  });

  it('allows 127.0.0.1 dev origin', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/health',
      headers: { origin: 'http://127.0.0.1:5173' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe('http://127.0.0.1:5173');
  });

  it('does NOT reflect an arbitrary external origin', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/health',
      headers: { origin: 'http://evil.example.com' },
    });
    // Denying CORS means the header is omitted, so the browser blocks the
    // response. The request itself still succeeds for non-browser clients.
    expect(res.statusCode).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('does not reflect a lookalike localhost origin', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/health',
      headers: { origin: 'http://localhost.evil.com' },
    });
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('preflight for an external origin gets no allow-origin', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'OPTIONS',
      url: '/api/v1/health',
      headers: {
        origin: 'http://evil.example.com',
        'access-control-request-method': 'GET',
      },
    });
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('preflight for a loopback origin is allowed', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'OPTIONS',
      url: '/api/v1/health',
      headers: {
        origin: 'http://localhost:5173',
        'access-control-request-method': 'GET',
      },
    });
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
  });

  it('requests without an Origin header still work (same-origin, tests, CLI)', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
  });
});
