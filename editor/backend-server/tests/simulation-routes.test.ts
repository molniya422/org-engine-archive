import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';
import { registerSimulationRoutes, type SimulateExecutor } from '../src/personal/simulation.routes';

const fakeExec: SimulateExecutor = async (_contract, calls) => {
  const actions = calls.map((c) => ({
    tool: c.tool,
    status: c.tool === 'external_send' ? 'simulated_no_effect' : 'simulated_wrote',
    risk_level: c.tool === 'external_send' ? 'high' : 'low',
  }));
  return {
    simulated: true,
    status: 'simulated',
    action_diff: actions.map((a) => ({ tool: a.tool, diff_type: 'create', risk_level: a.risk_level })),
    risk_summary: {
      total_actions: actions.length,
      low_risk: actions.filter((a) => a.risk_level === 'low').length,
      high_risk: actions.filter((a) => a.risk_level === 'high').length,
    },
    expected_evidence: actions.map((a) => ({ check: `${a.tool}_evidence`, verification: 'simulated', simulated: true })),
  };
};

describe('P6.1 simulation routes', () => {
  it('returns simulated=true and never a real done/verified status', async () => {
    const app = Fastify({ logger: false });
    registerSimulationRoutes(app, fakeExec);
    const res = await app.inject({
      method: 'POST', url: '/api/v1/personal/simulate',
      payload: {
        contract: { id: 'task_1' },
        calls: [
          { tool: 'create_draft', parameters: { path: 'workspace/d.md', content: 'x' } },
          { tool: 'external_send', parameters: { to: 'x@e.com' } },
        ],
      },
    });
    const body = res.json();
    expect(res.statusCode).toBe(200);
    expect(body.simulated).toBe(true);
    expect(body.status).toBe('simulated');
    for (const e of body.expected_evidence) {
      expect(e.verification).toBe('simulated');
    }
    app.close();
  });

  it('rejects simulation without a contract (fail-closed)', async () => {
    const app = Fastify({ logger: false });
    registerSimulationRoutes(app, fakeExec);
    const res = await app.inject({ method: 'POST', url: '/api/v1/personal/simulate', payload: { calls: [] } });
    expect(res.statusCode).toBe(400);
    app.close();
  });

  it('a failing executor maps to 503 but still simulated=true (never a real result)', async () => {
    const app = Fastify({ logger: false });
    registerSimulationRoutes(app, async () => { throw new Error('boom'); });
    const res = await app.inject({
      method: 'POST', url: '/api/v1/personal/simulate',
      payload: { contract: { id: 't' }, calls: [] },
    });
    expect(res.statusCode).toBe(503);
    expect(res.json().simulated).toBe(true);
    app.close();
  });
});
