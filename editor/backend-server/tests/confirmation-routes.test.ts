import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';
import { registerConfirmationRoutes, ConfirmationGate } from '../src/personal/confirmation.routes';
import { canonicalHashHex } from '../src/personal/canonical-json';

function gateWithToken() {
  const gate = new ConfirmationGate();
  const ticket = gate.issue('task_1', 'a1', { path: 'workspace/a.md', content: 'hi' });
  return { gate, ticket };
}

describe('P5.2 confirmation routes (TS mirror)', () => {
  it('issues a token bound to task, action and parameter hash', async () => {
    const app = Fastify({ logger: false });
    registerConfirmationRoutes(app, new ConfirmationGate());
    const res = await app.inject({
      method: 'POST', url: '/api/v1/personal/confirmations',
      payload: { task_id: 'task_1', action_id: 'a1', parameters: { path: 'workspace/a.md' } },
    });
    const body = res.json();
    expect(res.statusCode).toBe(201);
    expect(body.token).toMatch(/^tok_[0-9a-f]{32}$/);
    expect(body.parameters_hash).toHaveLength(64);
    app.close();
  });

  it('rejects non-object parameters with 400', async () => {
    const app = Fastify({ logger: false });
    registerConfirmationRoutes(app, new ConfirmationGate());
    for (const parameters of ['not-an-object', [1, 2], 42]) {
      const res = await app.inject({
        method: 'POST', url: '/api/v1/personal/confirmations',
        payload: { task_id: 'task_1', action_id: 'a1', parameters },
      });
      expect(res.statusCode).toBe(400);
    }
    app.close();
  });

  it('returns 400 (not 500) when parameters contain a non-integer float', async () => {
    const app = Fastify({ logger: false });
    registerConfirmationRoutes(app, new ConfirmationGate());
    const res = await app.inject({
      method: 'POST', url: '/api/v1/personal/confirmations',
      payload: { task_id: 'task_1', action_id: 'a1', parameters: { size: 9.9 } },
    });
    expect(res.statusCode).toBe(400);
    app.close();
  });

  it('binds the canonical hash of the parameters', () => {
    // 与 Python permission_gate._param_hash 必须同源；否则跨语言 token 永远校验失败。
    const gate = new ConfirmationGate();
    const ticket = gate.issue('task_1', 'a1', { path: '/inbox/a.md', content: 'x' });
    expect(ticket.parameters_hash)
      .toBe(canonicalHashHex({ content: 'x', path: '/inbox/a.md' }));
  });

  it('authorizes once then rejects replay', async () => {
    const { gate, ticket } = gateWithToken();
    const app = Fastify({ logger: false });
    registerConfirmationRoutes(app, gate);

    const first = await app.inject({
      method: 'POST', url: '/api/v1/personal/confirmations/authorize',
      payload: {
        token: ticket.token, task_id: 'task_1', action_id: 'a1',
        parameters: { path: 'workspace/a.md', content: 'hi' },
      },
    });
    expect(first.statusCode).toBe(200);

    const replay = await app.inject({
      method: 'POST', url: '/api/v1/personal/confirmations/authorize',
      payload: {
        token: ticket.token, task_id: 'task_1', action_id: 'a1',
        parameters: { path: 'workspace/a.md', content: 'hi' },
      },
    });
    expect(replay.statusCode).toBe(403);
    expect(replay.json().recoverable).toBe(true);
    app.close();
  });

  it('changed parameters invalidate the token', async () => {
    const { gate, ticket } = gateWithToken();
    const app = Fastify({ logger: false });
    registerConfirmationRoutes(app, gate);
    const res = await app.inject({
      method: 'POST', url: '/api/v1/personal/confirmations/authorize',
      payload: {
        token: ticket.token, task_id: 'task_1', action_id: 'a1',
        parameters: { path: 'workspace/TAMPERED.md', content: 'hi' },
      },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toContain('变化');
    app.close();
  });

  it('expired tokens cannot be replayed', async () => {
    const { gate, ticket } = gateWithToken();
    gate.expire(ticket.token);
    const app = Fastify({ logger: false });
    registerConfirmationRoutes(app, gate);
    const res = await app.inject({
      method: 'POST', url: '/api/v1/personal/confirmations/authorize',
      payload: {
        token: ticket.token, task_id: 'task_1', action_id: 'a1',
        parameters: { path: 'workspace/a.md', content: 'hi' },
      },
    });
    expect(res.statusCode).toBe(403);
    app.close();
  });
});
