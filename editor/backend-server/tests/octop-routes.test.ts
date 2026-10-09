import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';
import { registerOctopRoutes, type OctopLikeTransport } from '../src/personal/octop.routes';

function fakeTransport(): OctopLikeTransport & { proposals: Map<string, any> } {
  const proposals = new Map<string, any>();
  return {
    proposals,
    async listSessions() { return [{ id: 's1', name: '本地文件整理' }]; },
    async readToolReceipt(id: string) {
      if (id === 'missing') throw new Error('not found');
      return { receipt_id: id, status: 'success' };
    },
    async proposeToolAction(p) {
      const id = String(p['proposal_id']);
      proposals.set(id, p);
      return { proposal_id: id, status: 'proposed' };
    },
    async executeApprovedAction(proposalId, token) {
      const p = proposals.get(proposalId);
      if (!p || p.expected_token !== token) throw new Error('confirmation token invalid');
      return { receipt_id: `r_${proposalId}`, status: 'success' };
    },
  };
}

describe('P4.4 octop routes', () => {
  it('lists sessions with protocol version', async () => {
    const app = Fastify({ logger: false });
    registerOctopRoutes(app, fakeTransport());
    const res = await app.inject({ method: 'GET', url: '/api/v1/personal/octop/sessions' });
    expect(res.statusCode).toBe(200);
    expect(res.json().protocol_version).toBe('1.0.2b5');
    app.close();
  });

  it('propose carries trace/contract/policy/token into the proposal', async () => {
    const transport = fakeTransport();
    const app = Fastify({ logger: false });
    registerOctopRoutes(app, transport);
    const res = await app.inject({
      method: 'POST', url: '/api/v1/personal/octop/propose',
      payload: {
        trace_id: 'trace_t', contract_version: 1, policy_version: 'baseline-0.1',
        candidate: { id: 'a1', kind: 'draft', risk_level: 'low', parameters: {} },
        confirmation_token: 'tok_1',
      },
    });
    expect(res.statusCode).toBe(200);
    const stored = transport.proposals.get('prop_trace_t_a1');
    expect(stored.expected_token).toBe('tok_1');
    expect(stored.trace_id).toBe('trace_t');
    app.close();
  });

  it('wrong token maps to 403 with needs_reconfirmation (recoverable)', async () => {
    const transport = fakeTransport();
    const app = Fastify({ logger: false });
    registerOctopRoutes(app, transport);
    await app.inject({
      method: 'POST', url: '/api/v1/personal/octop/propose',
      payload: {
        trace_id: 't', contract_version: 1, policy_version: 'p',
        candidate: { id: 'a1', kind: 'draft', risk_level: 'low', parameters: {} },
        confirmation_token: 'right',
      },
    });
    const res = await app.inject({
      method: 'POST', url: '/api/v1/personal/octop/execute',
      payload: { proposal_id: 'prop_t_a1', confirmation_token: 'wrong' },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().needs_reconfirmation).toBe(true);
    app.close();
  });

  it('transport failure maps to 503 recoverable — never guessed success', async () => {
    const dead: OctopLikeTransport = {
      async listSessions() { throw new Error('refused'); },
      async readToolReceipt() { throw new Error('refused'); },
      async proposeToolAction() { throw new Error('refused'); },
      async executeApprovedAction() { throw new Error('refused'); },
    };
    const app = Fastify({ logger: false });
    registerOctopRoutes(app, dead);
    const res = await app.inject({ method: 'GET', url: '/api/v1/personal/octop/sessions' });
    expect(res.statusCode).toBe(503);
    expect(res.json().recoverable).toBe(true);
    app.close();
  });
});
