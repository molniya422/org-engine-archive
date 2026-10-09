import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';
import { registerConfirmationRoutes, ConfirmationGate } from '../src/personal/confirmation.routes';

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
    expect(body.token).toMatch(/^tok_/);
    expect(body.parameters_hash).toHaveLength(64);
    app.close();
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
