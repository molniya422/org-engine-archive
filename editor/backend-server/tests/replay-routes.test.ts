import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';
import { registerReplayRoutes, type ReplayExecutor, type ReplayRecordWire } from '../src/personal/replay.routes';

const record: ReplayRecordWire = {
  trace_id: 'trace_1',
  input_envelope: { contract_version: 1, task_id: 'task_1' },
  state_snapshot: { facts: [] },
  model_version: 'fake-1.0',
  policy_version: 'baseline-0.1',
  tool_receipts: [{ tool: 'create_draft', ok: true }],
  nodes: [
    { step: 0, event: 'intent_understood', detail: {} },
    { step: 1, event: 'action_selected', detail: { action: 'a1' } },
  ],
};

const exec: ReplayExecutor = {
  async replay(rec, fromStep) {
    return [
      { step: -1, event: 'state_snapshot', detail: rec.state_snapshot },
      ...rec.nodes.filter((n) => n.step >= fromStep),
    ];
  },
  async compare(oldR, newR) {
    return {
      action_diffs: oldR.nodes[1].detail['action'] === newR.nodes[1].detail['action'] ? [] : [{ step: 1 }],
      contract_version_changed:
        oldR.input_envelope['contract_version'] !== newR.input_envelope['contract_version'],
    };
  },
};

describe('P6.2 replay routes', () => {
  it('replays from a given step with state snapshot prefix', async () => {
    const app = Fastify({ logger: false });
    registerReplayRoutes(app, exec);
    const res = await app.inject({
      method: 'POST', url: '/api/v1/personal/replay',
      payload: { record, from_step: 1 },
    });
    const body = res.json();
    expect(res.statusCode).toBe(200);
    expect(body.events[0].event).toBe('state_snapshot');
    expect(body.events[1].detail.action).toBe('a1');
    app.close();
  });

  it('compares two versions and reports action/contract diffs', async () => {
    const app = Fastify({ logger: false });
    registerReplayRoutes(app, exec);
    const newRec = { ...record, input_envelope: { ...record.input_envelope, contract_version: 2 } };
    const res = await app.inject({
      method: 'POST', url: '/api/v1/personal/replay/compare',
      payload: { old: record, new: newRec },
    });
    const body = res.json();
    expect(res.statusCode).toBe(200);
    expect(body.diffs.contract_version_changed).toBe(true);
    app.close();
  });

  it('rejects replay without trace_id (fail-closed)', async () => {
    const app = Fastify({ logger: false });
    registerReplayRoutes(app, exec);
    const res = await app.inject({ method: 'POST', url: '/api/v1/personal/replay', payload: { record: {} } });
    expect(res.statusCode).toBe(400);
    app.close();
  });
});
