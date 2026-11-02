import { describe, it, expect } from 'vitest';
import { createServer } from 'node:http';
import type { ServerResponse } from 'node:http';
import {
  assertLoopbackServiceUrl,
  callService,
  serviceExecutorAdapters,
  ServiceRejectedError,
  ServiceUnavailableError,
} from '../src/personal/service-client';
import type { EvalCaseWire, EvalOutcomeWire } from '../src/personal/eval.routes';
import type { ReplayRecordWire } from '../src/personal/replay.routes';
import type { SandboxCallWire } from '../src/personal/simulation.routes';

interface Captured {
  path: string;
  body: any;
}

/**
 * 起一个本地桩：记录每个请求的 path/body，响应由 handler 决定。
 * handler 拿到 res 后可以正常返回、返回错误码，或故意不结束（模拟挂起）。
 */
async function stubService(
  handler: (path: string, body: any, res: ServerResponse) => void,
): Promise<{ url: string; captured: Captured[]; close: () => Promise<void> }> {
  const captured: Captured[] = [];
  const server = createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      const body = raw ? JSON.parse(raw) : {};
      captured.push({ path: String(req.url), body });
      handler(String(req.url), body, res);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  return {
    url: `http://127.0.0.1:${port}`,
    captured,
    close: async () => {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

function json(res: ServerResponse, status: number, payload: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

const CASE: EvalCaseWire = {
  id: 'c1',
  input: { question: 'hi' },
  expected_behavior: { must_ask: [] },
};

const OUTCOME: EvalOutcomeWire = { case_id: 'c1', asked: [] };

const RECORD: ReplayRecordWire = {
  trace_id: 'tr_1',
  input_envelope: {},
  state_snapshot: {},
  model_version: 'm1',
  policy_version: 'p1',
  tool_receipts: [],
  nodes: [],
};

const CALLS: SandboxCallWire[] = [{ tool: 'write_file', parameters: { path: 'a.md' } }];

describe('assertLoopbackServiceUrl', () => {
  it('accepts loopback hosts (127.0.0.1 / localhost / ::1)', () => {
    expect(() => assertLoopbackServiceUrl('http://127.0.0.1:5174')).not.toThrow();
    expect(() => assertLoopbackServiceUrl('http://localhost:5174')).not.toThrow();
    expect(() => assertLoopbackServiceUrl('http://[::1]:5174')).not.toThrow();
  });

  it('refuses non-loopback hosts', () => {
    expect(() => assertLoopbackServiceUrl('http://192.168.1.10:5174')).toThrow(ServiceUnavailableError);
    expect(() => assertLoopbackServiceUrl('https://example.com')).toThrow(ServiceUnavailableError);
  });

  it('is not fooled by userinfo or suffix tricks', () => {
    expect(() => assertLoopbackServiceUrl('http://127.0.0.1@evil.com')).toThrow(ServiceUnavailableError);
    expect(() => assertLoopbackServiceUrl('http://localhost.evil.com')).toThrow(ServiceUnavailableError);
    expect(() => assertLoopbackServiceUrl('http://127.0.0.1.evil.com')).toThrow(ServiceUnavailableError);
  });

  it('only allows http and https schemes', () => {
    expect(() => assertLoopbackServiceUrl('file:///tmp/x')).toThrow(ServiceUnavailableError);
    expect(() => assertLoopbackServiceUrl('ftp://127.0.0.1')).toThrow(ServiceUnavailableError);
  });
});

describe('callService error classification', () => {
  it('throws ServiceRejectedError with status and original payload on 5xx', async () => {
    const svc = await stubService((_p, _b, res) => {
      json(res, 500, { error: 'runner exploded', detail: 'traceback' });
    });
    try {
      const err = await callService({ baseUrl: svc.url, timeoutMs: 5_000 }, '/v1/eval', {})
        .catch((e) => e);
      expect(err).toBeInstanceOf(ServiceRejectedError);
      expect(err.status).toBe(500);
      expect(err.payload).toEqual({ error: 'runner exploded', detail: 'traceback' });
      expect(err.message).toContain('runner exploded');
    } finally {
      await svc.close();
    }
  });

  it('throws ServiceUnavailableError when the server never responds', async () => {
    const svc = await stubService(() => { /* 永不响应 */ });
    try {
      const err = await callService({ baseUrl: svc.url, timeoutMs: 100 }, '/v1/eval', {})
        .catch((e) => e);
      expect(err).toBeInstanceOf(ServiceUnavailableError);
    } finally {
      await svc.close();
    }
  });

  it('throws ServiceUnavailableError when headers arrive but the body stalls', async () => {
    const svc = await stubService((_p, _b, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': '100' });
      res.write('{"report":');
      // 故意不 end()：模拟服务端发完头后卡住
    });
    try {
      const err = await callService({ baseUrl: svc.url, timeoutMs: 100 }, '/v1/eval', {})
        .catch((e) => e);
      expect(err).toBeInstanceOf(ServiceUnavailableError);
    } finally {
      await svc.close();
    }
  });

  it('normalizes a trailing slash in baseUrl', async () => {
    const svc = await stubService((_p, _b, res) => {
      json(res, 200, { report: { ready: true } });
    });
    try {
      await callService({ baseUrl: `${svc.url}/`, timeoutMs: 5_000 }, '/v1/eval', {});
      expect(svc.captured[0].path).toBe('/v1/eval');
    } finally {
      await svc.close();
    }
  });
});

describe('serviceExecutorAdapters contract', () => {
  it('eval posts cases/outcomes and unwraps report', async () => {
    const svc = await stubService((_p, _b, res) => json(res, 200, { report: { ready: true, passed: 1 } }));
    try {
      const out = await serviceExecutorAdapters(svc.url).eval.run([CASE], [OUTCOME]);
      expect(svc.captured[0].path).toBe('/v1/eval');
      expect(svc.captured[0].body).toEqual({ cases: [CASE], outcomes: [OUTCOME] });
      expect(out).toEqual({ ready: true, passed: 1 });
    } finally {
      await svc.close();
    }
  });

  it('replay posts record/from_step and unwraps events', async () => {
    const svc = await stubService((_p, _b, res) => json(res, 200, { events: [{ step: 2 }] }));
    try {
      const out = await serviceExecutorAdapters(svc.url).replay.replay(RECORD, 2);
      expect(svc.captured[0].path).toBe('/v1/replay');
      expect(svc.captured[0].body).toEqual({ record: RECORD, from_step: 2 });
      expect(out).toEqual([{ step: 2 }]);
    } finally {
      await svc.close();
    }
  });

  it('replay.compare posts old/new and unwraps diff', async () => {
    const other: ReplayRecordWire = { ...RECORD, trace_id: 'tr_2' };
    const svc = await stubService((_p, _b, res) => json(res, 200, { diff: { changed: ['x'] } }));
    try {
      const out = await serviceExecutorAdapters(svc.url).replay.compare(RECORD, other);
      expect(svc.captured[0].path).toBe('/v1/replay/compare');
      expect(svc.captured[0].body).toEqual({ old: RECORD, new: other });
      expect(out).toEqual({ changed: ['x'] });
    } finally {
      await svc.close();
    }
  });

  it('simulate posts contract/calls and unwraps simulation', async () => {
    const contract = { task_id: 't1' };
    const svc = await stubService((_p, _b, res) => json(res, 200, { simulation: { actions: [] } }));
    try {
      const out = await serviceExecutorAdapters(svc.url).simulate(contract, CALLS);
      expect(svc.captured[0].path).toBe('/v1/simulate');
      expect(svc.captured[0].body).toEqual({ contract, calls: CALLS });
      expect(out).toEqual({ actions: [] });
    } finally {
      await svc.close();
    }
  });

  it('rejects a 200 response with an empty body shape instead of faking success', async () => {
    const svc = await stubService((_p, _b, res) => json(res, 200, {}));
    try {
      const adapters = serviceExecutorAdapters(svc.url);
      const calls = [
        () => adapters.eval.run([CASE], [OUTCOME]),
        () => adapters.replay.replay(RECORD, 0),
        () => adapters.replay.compare(RECORD, RECORD),
        () => adapters.simulate({}, []),
      ];
      for (const call of calls) {
        const err = await call().catch((e) => e);
        expect(err).toBeInstanceOf(ServiceUnavailableError);
        expect(err.message).toContain('malformed response from personal service');
      }
    } finally {
      await svc.close();
    }
  });

  it('rejects wrong-typed top-level fields', async () => {
    const cases: Array<[string, unknown]> = [
      ['/v1/eval', { report: null }],
      ['/v1/replay', { events: 'nope' }],
      ['/v1/replay/compare', { diff: [] }],
      ['/v1/simulate', { simulation: 'nope' }],
    ];
    for (const [path, payload] of cases) {
      const svc = await stubService((_p, _b, res) => json(res, 200, payload));
      try {
        const adapters = serviceExecutorAdapters(svc.url);
        const call =
          path === '/v1/eval'
            ? () => adapters.eval.run([CASE], [OUTCOME])
            : path === '/v1/replay'
              ? () => adapters.replay.replay(RECORD, 0)
              : path === '/v1/replay/compare'
                ? () => adapters.replay.compare(RECORD, RECORD)
                : () => adapters.simulate({}, []);
        await expect(call()).rejects.toBeInstanceOf(ServiceUnavailableError);
      } finally {
        await svc.close();
      }
    }
  });
});
