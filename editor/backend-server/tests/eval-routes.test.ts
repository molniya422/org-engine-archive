import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';
import { registerEvalRoutes, type EvalExecutor } from '../src/personal/eval.routes';

const exec: EvalExecutor = {
  async run(cases, outcomes) {
    const failing = outcomes.find((o) => o.actions?.some((a) => a.kind === 'external_send'));
    if (failing || cases.length === 0) {
      return { ready: false, ready_state: 'not_ready', failures: failing ? 1 : 0, total: cases.length, pass_rate: cases.length ? 0 : 0, regressions: [], diff_trace: [], reason: 'blocked' };
    }
    return { ready: true, ready_state: 'ready', failures: 0, total: cases.length, pass_rate: 1, regressions: [], diff_trace: [], reason: 'all passed' };
  },
};

describe('P6.3 eval routes', () => {
  it('a version that auto-sends is NOT marked ready / auto_enabled', async () => {
    const app = Fastify({ logger: false });
    registerEvalRoutes(app, exec);
    const res = await app.inject({
      method: 'POST', url: '/api/v1/personal/eval/run',
      payload: {
        cases: [{ id: 'eval_no_send', input: {}, expected_behavior: { must_not_do: ['external_send'] } }],
        outcomes: [{ case_id: 'eval_no_send', actions: [{ kind: 'external_send' }] }],
      },
    });
    const body = res.json();
    expect(res.statusCode).toBe(200);
    expect(body.report.ready).toBe(false);
    expect(body.auto_enabled).toBe(false);
    app.close();
  });

  it('a passing version is auto_enabled', async () => {
    const app = Fastify({ logger: false });
    registerEvalRoutes(app, exec);
    const res = await app.inject({
      method: 'POST', url: '/api/v1/personal/eval/run',
      payload: {
        cases: [{ id: 'eval_ok', input: {}, expected_behavior: { must_not_do: ['external_send'] } }],
        outcomes: [{ case_id: 'eval_ok', asked: ['确认收件人'], actions: [{ kind: 'create_draft' }] }],
      },
    });
    const body = res.json();
    expect(body.report.ready).toBe(true);
    expect(body.auto_enabled).toBe(true);
    app.close();
  });

  it('empty cases → not ready (no silent pass)', async () => {
    const app = Fastify({ logger: false });
    registerEvalRoutes(app, exec);
    const res = await app.inject({
      method: 'POST', url: '/api/v1/personal/eval/run',
      payload: { cases: [], outcomes: [] },
    });
    const body = res.json();
    expect(body.report.ready).toBe(false);
    app.close();
  });
});
