/**
 * pipeline.routes 单测 — 用进程内 HTTP 桩替代 Python decision service，
 * 断言 TS → service 的请求契约（尤其是超时单位）与状态映射。
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createServer, type Server } from 'node:http';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import Fastify from 'fastify';
import { PersonalStore } from '../src/personal/store';
import { ExecutionStore } from '../src/personal/executions';
import { registerPipelineRoutes } from '../src/personal/pipeline.routes';

const TMP = join(process.cwd(), '.tmp-pipeline-routes');

function rmRf(p: string): void {
  try { rmSync(p, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }); } catch { /* windows */ }
}

const TASK = {
  schema_version: 1,
  id: 'task_pipe_01',
  goal: '整理材料并生成汇总草稿',
  success_criteria: ['生成汇总文件'],
  allowed_scopes: ['workspace/'],
  forbidden_actions: ['external_send'],
  required_evidence: ['file_ref'],
  risk_level: 'low',
  confirmation_points: [],
  status: 'draft',
  version: 1,
  created_at: '2026-10-18T00:00:00Z',
};

const OCTOP = {
  base_url: 'http://127.0.0.1:8088',
  username: 'admin',
  password: 'secret',
  agent_name: 'personal',
  workspace_root: TMP,
};

interface Captured {
  path: string;
  body: Record<string, unknown>;
}

/** Minimal Python-service stand-in: records bodies, returns scripted responses. */
async function fakeService(handlers: Record<string, (body: any) => unknown>) {
  const captured: Captured[] = [];
  const server: Server = createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', async () => {
      const body = raw ? JSON.parse(raw) : {};
      captured.push({ path: String(req.url), body });
      // 就绪检查会先打 GET /health：所有桩默认健康，避免每个测试重复声明。
      const handler = handlers[String(req.url)]
        ?? (String(req.url) === '/health' ? () => ({ ok: true }) : undefined);
      let status = handler ? 200 : 404;
      let out: unknown;
      try {
        out = handler ? await handler(body) : { error: 'not found' };
      } catch (e) {
        // 桩里抛错模拟 service 500：绝不能把异常漏成未捕获异常而杀进程。
        status = 500;
        out = { error: e instanceof Error ? e.message : String(e) };
      }
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(out));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  return { url: `http://127.0.0.1:${port}`, captured, close: () => server.close() };
}

/** /health 正常，其余请求直接断开：模拟"启动后 service 掉线"。 */
async function flakyService() {
  const server = createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    req.socket.destroy();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as any).port;
  return { url: `http://127.0.0.1:${port}`, close: () => server.close() };
}

/** Octop 桩：就绪检查只打 GET /api/health。 */
async function octopStub() {
  const server = createServer((req, res) => {
    const ok = req.url === '/api/health';
    res.writeHead(ok ? 200 : 404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(ok ? { ok: true, db: true } : { error: 'not found' }));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as any).port;
  return { url: `http://127.0.0.1:${port}`, close: () => server.close() };
}

/** 轮询到条件成立或超时；替代固定 sleep，避免慢机器 flake。 */
async function waitFor(check: () => boolean, timeoutMs = 3000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (check()) return;
    await new Promise((r) => setTimeout(r, 20));
  }
  if (!check()) throw new Error(`waitFor timed out after ${timeoutMs}ms`);
}

const PLAN = {
  trace_id: 'tr_pipe_01',
  task_id: TASK.id,
  contract_version: 1,
  policy_version: 'baseline-0.1',
  candidates: [{ id: `${TASK.id}_a0`, kind: 'draft', risk_level: 'medium', parameters: { instruction: TASK.goal } }],
  verdict: 'select',
  selected_action: `${TASK.id}_a0`,
  reason: 'ok',
  missing_information: [],
  rule_refs: [],
  requires_confirmation: false,
};

const EXEC = {
  status: 'done',
  error: null,
  final_text: '完成',
  overall_verification: 'verified',
  events: [],
  receipts: [
    {
      event_id: 'live:T1:c1',
      call_id: 'c1',
      tool_name: 'write_file',
      args: { path: '汇总.md' },
      result: 'Updated',
      is_error: false,
      evidence: {
        id: 'ev_1', kind: 'tool_result', locator: 'live:T1:c1',
        content_hash: 'sha256:abc', captured_at: '2026-10-18T00:00:00Z',
        sensitivity: 'normal', supports: [],
      },
    },
  ],
  verifications: [{ event_id: 'live:T1:c1', tool: 'write_file', status: 'verified', checks: [], reason: 'ok' }],
  hitl_log: [],
};

/** 每个测试用独立 DB：后台 dispatch 可能活到下一个测试，共享文件会互相干扰。 */
let caseSeq = 0;
let octop: Awaited<ReturnType<typeof octopStub>>;

async function buildApp(
  serviceUrl: string,
  octopOverride?: Partial<typeof OCTOP>,
  taskOverride: Record<string, unknown> = TASK,
) {
  caseSeq += 1;
  const dbPath = join(TMP, `personal-${caseSeq}.sqlite`);
  const store = new PersonalStore({ dbPath });
  const executions = new ExecutionStore(store);
  const app = Fastify({ logger: false });
  registerPipelineRoutes(app, {
    store, serviceUrl, executions,
    // 就绪检查要求 Octop 可达且工作区存在：真跑一遍 /api/health。
    octop: { ...OCTOP, base_url: octop.url, workspace_root: TMP, ...octopOverride },
  });
  store.saveTaskWithEvidence(taskOverride as any, []);
  return { app, store, executions };
}

beforeAll(async () => {
  rmRf(TMP);
  mkdirSync(TMP, { recursive: true });
  octop = await octopStub();
});

afterAll(() => { octop.close(); rmRf(TMP); });

describe('pipeline.routes → decision service contract', () => {
  it('sends timeout_s in seconds (not milliseconds) to /v1/execute', async () => {
    const svc = await fakeService({
      '/v1/plan': () => ({ plan: PLAN }),
      '/v1/execute': () => EXEC,
    });
    const { app, store } = await buildApp(svc.url);

    const res = await app.inject({
      method: 'POST', url: `/api/v1/personal/tasks/${TASK.id}/run`, payload: {},
    });
    expect(res.statusCode).toBe(202);
    expect(res.json().status).toBe('running');

    // executeRun 是 fire-and-forget；轮询直到它落地
    await waitFor(() => svc.captured.some((c) => c.path === '/v1/execute'));

    const exec = svc.captured.find((c) => c.path === '/v1/execute');
    expect(exec).toBeTruthy();
    // 秒，不是毫秒。55 分钟是为了覆盖 19k prompt 的 prefill（实测 ~25 分钟）。
    expect(exec!.body.timeout_s).toBe(55 * 60);
    expect(exec!.body.timeout_s).toBeLessThan(3600);
    svc.close();
    store.close();
  });

  it('maps verified execution to task status verified and persists evidence', async () => {
    const svc = await fakeService({
      '/v1/plan': () => ({ plan: PLAN }),
      '/v1/execute': () => EXEC,
    });
    const { app, store } = await buildApp(svc.url);

    await app.inject({ method: 'POST', url: `/api/v1/personal/tasks/${TASK.id}/run`, payload: {} });
    await waitFor(() => store.getTask(TASK.id)!.status === 'verified');

    const task = store.getTask(TASK.id);
    expect(task!.status).toBe('verified');
    expect(store.getEvidence('ev_1')).toBeTruthy();
    svc.close();
    store.close();
  });

  it('returns 503 when octop is not configured', async () => {
    const store = new PersonalStore({ dbPath: join(TMP, 'personal.sqlite') });
    const app = Fastify({ logger: false });
    registerPipelineRoutes(app, {
      store, serviceUrl: 'http://127.0.0.1:1', octop: null,
      executions: new ExecutionStore(store),
    });
    store.saveTaskWithEvidence(TASK as any, []);

    const res = await app.inject({
      method: 'POST', url: `/api/v1/personal/tasks/${TASK.id}/run`, payload: {},
    });
    expect(res.statusCode).toBe(503);
    expect(res.json().error).toBe('octop_not_configured');
    store.close();
  });

  it('returns 503 not_ready with a structured diagnosis when the service is down', async () => {
    const svc = await fakeService({ '/v1/plan': () => ({ plan: PLAN }) });
    const { app, store } = await buildApp('http://127.0.0.1:1');
    const res = await app.inject({
      method: 'POST', url: `/api/v1/personal/tasks/${TASK.id}/run`, payload: {},
    });
    expect(res.statusCode).toBe(503);
    const body = res.json();
    expect(body.error).toBe('not_ready');
    expect(body.recoverable).toBe(true);
    expect(body.detail).toContain('personal_service');
    expect(body.checks.personal_service.ok).toBe(false);
    // 没就绪就不该浪费一次 plan 调用，也不该产生执行记录。
    expect(svc.captured.some((c) => c.path === '/v1/plan')).toBe(false);
    expect(store.listTasks()[0].status).not.toBe('running');
    svc.close(); store.close();
  });

  it('returns 503 not_ready when octop is configured but unreachable', async () => {
    const svc = await fakeService({ '/v1/plan': () => ({ plan: PLAN }) });
    // 最典型的坑：配置齐全、Octop 进程已死 —— 必须立刻诊断而不是挂 35 分钟。
    const { app, store } = await buildApp(svc.url, { base_url: 'http://127.0.0.1:1' });
    const res = await app.inject({
      method: 'POST', url: `/api/v1/personal/tasks/${TASK.id}/run`, payload: {},
    });
    expect(res.statusCode).toBe(503);
    expect(res.json().error).toBe('not_ready');
    expect(res.json().checks.octop.ok).toBe(false);
    expect(res.json().checks.personal_service.ok).toBe(true);
    expect(svc.captured.some((c) => c.path === '/v1/plan')).toBe(false);
    svc.close(); store.close();
  });

  it('refuses to run when saved settings disagree with the octop workspace', async () => {
    const svc = await fakeService({ '/v1/plan': () => ({ plan: PLAN }) });
    const { app, store } = await buildApp(svc.url);
    (store as any).db
      .prepare(`INSERT INTO personal_settings (id, version, settings, created_at, updated_at)
                VALUES ('personal_settings_singleton', 1, ?, '2026-10-24T00:00:00Z', '2026-10-24T00:00:00Z')`)
      .run(JSON.stringify({
        workspace: 'D:/完全不同的目录', model: 'local',
        privacy: 'local_only', permissions: ['read_only'],
      }));

    const res = await app.inject({
      method: 'POST', url: `/api/v1/personal/tasks/${TASK.id}/run`, payload: {},
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe('workspace_mismatch');
    expect(svc.captured.some((c) => c.path === '/v1/plan')).toBe(false);
    svc.close();
    store.close();
  });

  it('allows a run whose workspace is a parent of the octop root (case-insensitive)', async () => {
    const svc = await fakeService({
      '/v1/plan': () => ({ plan: PLAN }),
      '/v1/execute': () => EXEC,
    });
    const { app, store } = await buildApp(svc.url);
    (store as any).db
      .prepare(`INSERT INTO personal_settings (id, version, settings, created_at, updated_at)
                VALUES ('personal_settings_singleton', 1, ?, '2026-10-24T00:00:00Z', '2026-10-24T00:00:00Z')`)
      .run(JSON.stringify({
        workspace: TMP.replace(/\\/g, '/').toUpperCase(), model: 'local',
        privacy: 'local_only', permissions: ['read_only'],
      }));

    const res = await app.inject({
      method: 'POST', url: `/api/v1/personal/tasks/${TASK.id}/run`, payload: {},
    });
    expect(res.statusCode).toBe(202);
    svc.close();
    store.close();
  });

  it('does not treat a sibling directory sharing a name prefix as the workspace', async () => {
    // workspace 是 .../.tmp-pipeline-routes，root 是 .../.tmp-pipeline-routes-evil 时不能放行。
    const svc = await fakeService({ '/v1/plan': () => ({ plan: PLAN }) });
    const store = new PersonalStore({ dbPath: join(TMP, 'personal-sibling.sqlite') });
    const app = Fastify({ logger: false });
    registerPipelineRoutes(app, {
      store, serviceUrl: svc.url, executions: new ExecutionStore(store),
      octop: { ...OCTOP, workspace_root: `${TMP}-evil` },
    });
    store.saveTaskWithEvidence(TASK as any, []);
    (store as any).db
      .prepare(`INSERT INTO personal_settings (id, version, settings, created_at, updated_at)
                VALUES ('personal_settings_singleton', 1, ?, '2026-10-24T00:00:00Z', '2026-10-24T00:00:00Z')`)
      .run(JSON.stringify({
        workspace: TMP, model: 'local', privacy: 'local_only', permissions: ['read_only'],
      }));

    const res = await app.inject({
      method: 'POST', url: `/api/v1/personal/tasks/${TASK.id}/run`, payload: {},
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe('workspace_mismatch');
    svc.close();
    store.close();
  });

  it('does not execute when plan is blocked', async () => {
    const blocked = { ...PLAN, verdict: 'blocked', selected_action: null, reason: '禁止的动作' };
    const svc = await fakeService({
      '/v1/plan': () => ({ plan: blocked }),
      '/v1/execute': () => EXEC,
    });
    const { app, store } = await buildApp(svc.url);

    const res = await app.inject({
      method: 'POST', url: `/api/v1/personal/tasks/${TASK.id}/run`, payload: {},
    });
    expect(res.json().status).toBe('blocked');
    expect(store.getTask(TASK.id)!.status).toBe('blocked');
    expect(svc.captured.some((c) => c.path === '/v1/execute')).toBe(false);
    svc.close();
    store.close();
  });

  it('maps needs_confirmation to awaiting_confirmation without executing', async () => {
    const needs = { ...PLAN, verdict: 'needs_confirmation', requires_confirmation: true };
    const svc = await fakeService({
      '/v1/plan': () => ({ plan: needs }),
      '/v1/execute': () => EXEC,
    });
    const { app, store } = await buildApp(svc.url);

    const res = await app.inject({
      method: 'POST', url: `/api/v1/personal/tasks/${TASK.id}/run`, payload: {},
    });
    expect(res.json().status).toBe('awaiting_confirmation');
    expect(svc.captured.some((c) => c.path === '/v1/execute')).toBe(false);
    svc.close();
    store.close();
  });
});

describe('awaiting_confirmation decision flow', () => {
  const TASK_CONFIRM = {
    ...TASK,
    id: 'task_confirm_01',
    confirmation_points: [{ action_kind: 'create_draft', description: '开始执行前先问我' }],
  };
  const NEEDS = {
    ...PLAN,
    task_id: TASK_CONFIRM.id,
    candidates: [{
      id: `${TASK_CONFIRM.id}_a0`, kind: 'draft', risk_level: 'medium',
      parameters: { instruction: TASK_CONFIRM.goal },
    }],
    verdict: 'needs_confirmation',
    selected_action: `${TASK_CONFIRM.id}_a0`,
    requires_confirmation: true,
  };

  async function parkOne(serviceUrl: string) {
    const built = await buildApp(serviceUrl, undefined, TASK_CONFIRM);
    const res = await built.app.inject({
      method: 'POST', url: `/api/v1/personal/tasks/${TASK_CONFIRM.id}/run`, payload: {},
    });
    return { ...built, res, executionId: res.json().execution_id as string };
  }

  it('returns the pending action with the park response', async () => {
    const svc = await fakeService({ '/v1/plan': () => ({ plan: NEEDS }) });
    const { res, store } = await parkOne(svc.url);

    expect(res.json().status).toBe('awaiting_confirmation');
    expect(res.json().pending).toEqual({
      action_id: `${TASK_CONFIRM.id}_a0`,
      kind: 'create_draft',
      description: '开始执行前先问我',
      parameters: { instruction: TASK_CONFIRM.goal },
    });
    svc.close(); store.close();
  });

  it('exposes the pending action when the execution is fetched', async () => {
    const svc = await fakeService({ '/v1/plan': () => ({ plan: NEEDS }) });
    const { app, store, executionId } = await parkOne(svc.url);

    const detail = await app.inject({
      method: 'GET', url: `/api/v1/personal/executions/${executionId}`,
    });
    expect(detail.json().execution.pending).toMatchObject({
      action_id: `${TASK_CONFIRM.id}_a0`, kind: 'create_draft', description: '开始执行前先问我',
    });
    svc.close(); store.close();
  });

  it('confirms by dispatching the saved plan without re-planning or forwarding a token', async () => {
    const svc = await fakeService({
      '/v1/plan': () => ({ plan: NEEDS }),
      '/v1/execute': () => EXEC,
    });
    const { app, store, executions, executionId } = await parkOne(svc.url);

    const confirmed = await app.inject({
      method: 'POST', url: `/api/v1/personal/executions/${executionId}/confirm`, payload: {},
    });
    expect(confirmed.statusCode).toBe(202);
    expect(confirmed.json()).toMatchObject({ execution_id: executionId, status: 'running' });

    await waitFor(() => svc.captured.some((c) => c.path === '/v1/execute'));
    // 用户确认的是"那一份计划"：不能再规划一次，否则确定性的计划会无限循环。
    expect(svc.captured.filter((c) => c.path === '/v1/plan')).toHaveLength(1);
    expect(svc.captured.find((c) => c.path === '/v1/execute')!.body.confirmation_token).toBeNull();
    await waitFor(() => store.getTask(TASK_CONFIRM.id)!.status === 'verified');
    expect(executions.get(executionId)!.status).toBe('verified');
    svc.close(); store.close();
  });

  it('rejects by blocking the execution and cancelling the task', async () => {
    const svc = await fakeService({
      '/v1/plan': () => ({ plan: NEEDS }),
      '/v1/execute': () => EXEC,
    });
    const { app, store, executions, executionId } = await parkOne(svc.url);

    const rejected = await app.inject({
      method: 'POST', url: `/api/v1/personal/executions/${executionId}/reject`, payload: {},
    });
    expect(rejected.statusCode).toBe(200);
    expect(rejected.json().status).toBe('blocked');
    expect(executions.get(executionId)!.status).toBe('blocked');
    expect(store.getTask(TASK_CONFIRM.id)!.status).toBe('cancelled');
    expect(svc.captured.some((c) => c.path === '/v1/execute')).toBe(false);
    svc.close(); store.close();
  });

  it('refuses a decision on an execution that is no longer waiting', async () => {
    const svc = await fakeService({
      '/v1/plan': () => ({ plan: NEEDS }),
      '/v1/execute': () => EXEC,
    });
    const { app, store, executionId } = await parkOne(svc.url);

    await app.inject({
      method: 'POST', url: `/api/v1/personal/executions/${executionId}/reject`, payload: {},
    });
    const again = await app.inject({
      method: 'POST', url: `/api/v1/personal/executions/${executionId}/confirm`, payload: {},
    });
    expect(again.statusCode).toBe(409);
    expect(again.json().error).toBe('execution_not_waiting');
    expect(svc.captured.some((c) => c.path === '/v1/execute')).toBe(false);
    svc.close(); store.close();
  });
});

describe('durable /run behaviour', () => {
  it('returns 202 with an execution_id', async () => {
    const svc = await fakeService({ '/v1/plan': () => ({ plan: PLAN }), '/v1/execute': () => EXEC });
    const { app, store } = await buildApp(svc.url);
    const res = await app.inject({
      method: 'POST', url: `/api/v1/personal/tasks/${TASK.id}/run`, payload: {},
    });
    expect(res.statusCode).toBe(202);
    expect(res.json().execution_id).toMatch(/^exec_/);
    svc.close(); store.close();
  });

  it('two concurrent /run calls share one execution and one Octop turn', async () => {
    const svc = await fakeService({ '/v1/plan': () => ({ plan: PLAN }), '/v1/execute': () => EXEC });
    const { app, store } = await buildApp(svc.url);
    const [a, b] = await Promise.all([
      app.inject({ method: 'POST', url: `/api/v1/personal/tasks/${TASK.id}/run`, payload: {} }),
      app.inject({ method: 'POST', url: `/api/v1/personal/tasks/${TASK.id}/run`, payload: {} }),
    ]);
    expect(new Set([a.json().execution_id, b.json().execution_id]).size).toBe(1);
    await waitFor(() => svc.captured.some((c) => c.path === '/v1/execute'));
    await waitFor(() => store.getTask(TASK.id)!.status === 'verified');
    expect(svc.captured.filter((c) => c.path === '/v1/execute')).toHaveLength(1);
    svc.close(); store.close();
  });

  it('persists evidence before flipping the task to verified', async () => {
    const svc = await fakeService({ '/v1/plan': () => ({ plan: PLAN }), '/v1/execute': () => EXEC });
    const { app, store } = await buildApp(svc.url);
    await app.inject({ method: 'POST', url: `/api/v1/personal/tasks/${TASK.id}/run`, payload: {} });
    await waitFor(() => store.getTask(TASK.id)!.status === 'verified');
    expect(store.getTask(TASK.id)!.status).toBe('verified');
    expect(store.getEvidence('ev_1')).toBeTruthy();
    svc.close(); store.close();
  });

  it('I10: evidence persistence failure blocks the task instead of verifying it', async () => {
    const svc = await fakeService({ '/v1/plan': () => ({ plan: PLAN }), '/v1/execute': () => EXEC });
    const { app, store, executions } = await buildApp(svc.url);
    const run = await app.inject({
      method: 'POST', url: `/api/v1/personal/tasks/${TASK.id}/run`, payload: {},
    });
    const executionId = run.json().execution_id;
    // 故障注入：报告说 verified，但证据落库时磁盘出错。
    vi.spyOn(store, 'saveEvidence').mockImplementationOnce(() => { throw new Error('disk full'); });

    await waitFor(() => executions.get(executionId)!.status !== 'running');
    expect(store.getTask(TASK.id)!.status).toBe('blocked');
    expect(executions.get(executionId)!.status).not.toBe('verified');
    svc.close(); store.close();
  });

  it('I10: an unreachable service leaves the execution recoverable, never verified', async () => {
    // /health 可答（就绪检查通过），但 POST /v1/plan 连接被断开。
    const svc = await flakyService();
    const { app, store, executions } = await buildApp(svc.url);
    const res = await app.inject({
      method: 'POST', url: `/api/v1/personal/tasks/${TASK.id}/run`, payload: {},
    });
    expect(res.statusCode).toBe(503);
    expect(res.json().error).toBe('decision_service_unreachable');
    const execution = executions.get(res.json().execution_id)!;
    expect(execution.status).toBe('recoverable');
    expect(store.getTask(TASK.id)!.status).toBe('blocked');
    svc.close();
    store.close();
  });

  it('C1: a timed-out turn is never verified even with green receipts', async () => {
    const timedOut = {
      ...EXEC,
      status: 'timeout',
      error: null,
      overall_verification: 'verified',
      receipts: [EXEC.receipts[0]],
      verifications: [{ event_id: 'live:T1:c1', tool: 'write_file', status: 'verified', checks: [], reason: 'ok' }],
    };
    const svc = await fakeService({ '/v1/plan': () => ({ plan: PLAN }), '/v1/execute': () => timedOut });
    const { app, store, executions } = await buildApp(svc.url);
    const run = await app.inject({
      method: 'POST', url: `/api/v1/personal/tasks/${TASK.id}/run`, payload: {},
    });
    const executionId = run.json().execution_id;

    await waitFor(() => executions.get(executionId)!.status !== 'running');
    expect(store.getTask(TASK.id)!.status).not.toBe('verified');
    expect(store.getTask(TASK.id)!.status).toBe('blocked');
    expect(executions.get(executionId)!.status).toBe('recoverable');
    svc.close(); store.close();
  });

  it('C2: an in-flight v1 execution cannot verify a task that moved to v2', async () => {
    let releaseExecute!: () => void;
    const executeGate = new Promise<void>((r) => { releaseExecute = r; });
    const svc = await fakeService({
      '/v1/plan': () => ({ plan: PLAN }),
      '/v1/execute': async () => { await executeGate; return EXEC; },
    });
    const { app, store, executions } = await buildApp(svc.url);
    const run = await app.inject({
      method: 'POST', url: `/api/v1/personal/tasks/${TASK.id}/run`, payload: {},
    });
    const executionId = run.json().execution_id;
    await waitFor(() => svc.captured.some((c) => c.path === '/v1/execute'));
    // 用户在执行期间把合同改成 v2（并回到 draft）。
    store.saveTaskWithEvidence({ ...TASK, status: 'draft', version: 2 } as any, []);

    releaseExecute();
    await waitFor(() => executions.get(executionId)!.status !== 'running');
    const task = store.getTask(TASK.id)!;
    expect(task.version).toBe(2);
    expect(task.status).not.toBe('verified');

    // 审计中应留下被拒的状态写入。
    const rejected = store.listAudit(50).filter((a) => a.event === 'task.status_rejected');
    expect(rejected.length).toBeGreaterThan(0);
    svc.close(); store.close();
  });

  it('C3/I10: resume re-dispatches the saved run_spec and really runs a second turn', async () => {
    let execCalls = 0;
    const svc = await fakeService({
      '/v1/plan': () => ({ plan: PLAN }),
      '/v1/execute': () => {
        execCalls += 1;
        // 第一次：超时（→ recoverable）；第二次：正常完成。
        return execCalls === 1 ? { ...EXEC, status: 'timeout', overall_verification: 'unverified' } : EXEC;
      },
    });
    const { app, store, executions } = await buildApp(svc.url);
    const run = await app.inject({
      method: 'POST', url: `/api/v1/personal/tasks/${TASK.id}/run`, payload: {},
    });
    const executionId = run.json().execution_id;
    await waitFor(() => executions.get(executionId)!.status === 'recoverable');
    expect(svc.captured.filter((c) => c.path === '/v1/execute')).toHaveLength(1);

    const resumed = await app.inject({
      method: 'POST', url: `/api/v1/personal/executions/${executionId}/resume`, payload: {},
    });
    expect(resumed.statusCode).toBe(202);
    expect(resumed.json()).toMatchObject({ execution_id: executionId, status: 'queued' });

    await waitFor(() => store.getTask(TASK.id)!.status === 'verified');
    expect(svc.captured.filter((c) => c.path === '/v1/execute')).toHaveLength(2);
    expect(executions.get(executionId)!.status).toBe('verified');
    svc.close(); store.close();
  });

  it('C4: a bare confirmation token cannot bypass the explicit approve/reject decision', async () => {
    const needs = { ...PLAN, verdict: 'needs_confirmation', requires_confirmation: true };
    const svc = await fakeService({
      '/v1/plan': () => ({ plan: needs }),
      '/v1/execute': () => EXEC,
    });
    const { app, store, executions } = await buildApp(svc.url);
    const first = await app.inject({
      method: 'POST', url: `/api/v1/personal/tasks/${TASK.id}/run`, payload: {},
    });
    expect(first.json().status).toBe('awaiting_confirmation');
    const executionId = first.json().execution_id;
    expect(executions.get(executionId)!.status).toBe('awaiting_confirmation');

    // 任意字符串不是"用户点了确认"：仍然停在等待态，不执行。
    const again = await app.inject({
      method: 'POST', url: `/api/v1/personal/tasks/${TASK.id}/run`,
      payload: { confirmation_token: 'tok_demo' },
    });
    expect(again.json()).toMatchObject({ execution_id: executionId, needs_confirmation: true });
    expect(executions.get(executionId)!.status).toBe('awaiting_confirmation');
    expect(svc.captured.some((c) => c.path === '/v1/execute')).toBe(false);
    expect(store.getTask(TASK.id)!.status).toBe('awaiting_confirmation');
    svc.close(); store.close();
  });

  it('I6: only verdict select executes; policy_error blocks without a turn', async () => {
    const policyError = {
      ...PLAN, verdict: 'policy_error', candidates: [], selected_action: null,
      reason: '策略输出非法',
    };
    const svc = await fakeService({
      '/v1/plan': () => ({ plan: policyError }),
      '/v1/execute': () => EXEC,
    });
    const { app, store, executions } = await buildApp(svc.url);
    const res = await app.inject({
      method: 'POST', url: `/api/v1/personal/tasks/${TASK.id}/run`, payload: {},
    });
    expect(res.json().status).toBe('blocked');
    expect(store.getTask(TASK.id)!.status).toBe('blocked');
    expect(svc.captured.some((c) => c.path === '/v1/execute')).toBe(false);
    expect(executions.get(res.json().execution_id)!.status).toBe('blocked');
    svc.close(); store.close();
  });

  it('I9: a claim that fails during setup is released instead of leaking', async () => {
    const svc = await fakeService({ '/v1/plan': () => ({ plan: PLAN }), '/v1/execute': () => EXEC });
    const { app, store, executions } = await buildApp(svc.url);
    // 非法 network_policy 让 buildTaskEnvelope 在 claim 之后同步抛错。
    store.saveTaskWithEvidence(
      { ...TASK, network_policy: { mode: 'bogus' } } as any, [],
    );
    const res = await app.inject({
      method: 'POST', url: `/api/v1/personal/tasks/${TASK.id}/run`, payload: {},
    });
    expect(res.statusCode).toBe(503);
    expect(res.json().error).toBe('run_setup_failed');
    const executionId = res.json().execution_id;
    expect(executions.get(executionId)!.status).not.toBe('queued');

    // 修复数据后重试必须真的重新跑起来（复用同一 execution，但不能被泄漏的 claim 挡住）。
    store.saveTaskWithEvidence({ ...TASK, status: 'draft', version: 1 } as any, []);
    const retry = await app.inject({
      method: 'POST', url: `/api/v1/personal/tasks/${TASK.id}/run`, payload: {},
    });
    expect(retry.statusCode).toBe(202);
    await waitFor(() => svc.captured.filter((c) => c.path === '/v1/execute').length === 1);
    await waitFor(() => store.getTask(TASK.id)!.status === 'verified');
    svc.close(); store.close();
  });

  it('I2: the running lease outlives the 30-minute turn timeout', async () => {
    let releaseExecute!: () => void;
    const executeGate = new Promise<void>((r) => { releaseExecute = r; });
    const svc = await fakeService({
      '/v1/plan': () => ({ plan: PLAN }),
      '/v1/execute': async () => { await executeGate; return EXEC; },
    });
    const { app, store, executions } = await buildApp(svc.url);
    const run = await app.inject({
      method: 'POST', url: `/api/v1/personal/tasks/${TASK.id}/run`, payload: {},
    });
    const executionId = run.json().execution_id;
    await waitFor(() => executions.get(executionId)!.status === 'running');

    // 租约必须 ≥ turn 超时（30 分钟）：否则 turn 还没结束，启动恢复就会把
    // 仍然活着的执行判死并重启第二个 Octop turn。
    const leaseUntil = new Date(executions.get(executionId)!.lease_until!).getTime();
    expect(leaseUntil - Date.now()).toBeGreaterThan(30 * 60_000);

    releaseExecute();
    await waitFor(() => executions.get(executionId)!.status === 'verified');
    svc.close(); store.close();
  });

  it('C3: /run adopts an expired queued execution and dispatches its saved run_spec', async () => {
    const svc = await fakeService({ '/v1/plan': () => ({ plan: PLAN }), '/v1/execute': () => EXEC });
    const { app, store, executions } = await buildApp(svc.url);
    // 模拟"进程在 plan 之后、dispatch 之前死掉"：queued 行 + 已过期租约 + run_spec。
    const { execution } = executions.claim(TASK.id, 1, 'dead-owner');
    executions.saveRunSpec(execution.execution_id, {
      envelope: {
        contract_version: 1, trace_id: execution.trace_id, task_id: TASK.id,
        allowed_scopes: ['workspace/'], confirmation_token: null,
      },
      plan: PLAN,
    });
    // 把租约改成过期。
    (store as any).db
      .prepare(`UPDATE executions SET lease_until = ? WHERE execution_id = ?`)
      .run(new Date(Date.now() - 60_000).toISOString(), execution.execution_id);

    const res = await app.inject({
      method: 'POST', url: `/api/v1/personal/tasks/${TASK.id}/run`, payload: {},
    });
    expect(res.statusCode).toBe(202);
    expect(res.json()).toMatchObject({ execution_id: execution.execution_id, adopted: true });

    await waitFor(() => svc.captured.filter((c) => c.path === '/v1/execute').length === 1);
    await waitFor(() => store.getTask(TASK.id)!.status === 'verified');
    // 没有重新规划：direct dispatch 用的是已保存的 plan。
    expect(svc.captured.some((c) => c.path === '/v1/plan')).toBe(false);
    svc.close(); store.close();
  });

  it('rejects a run whose task contract version does not match', async () => {
    const svc = await fakeService({ '/v1/plan': () => ({ plan: PLAN }), '/v1/execute': () => EXEC });
    const { app, store, executions } = await buildApp(svc.url);
    // 抢占一个不同版本的活跃执行
    executions.claim(TASK.id, 1, 'other-owner');
    store.saveTaskWithEvidence({ ...TASK, version: 7 } as any, []);
    const res = await app.inject({
      method: 'POST', url: `/api/v1/personal/tasks/${TASK.id}/run`, payload: {},
    });
    expect([409, 404]).toContain(res.statusCode);
    svc.close(); store.close();
  });

  it('persists search receipts with the execution id', async () => {
    const withSearch = {
      ...EXEC,
      search_decisions: [{ query_hash: 'sha256:q', decision: 'allowed' }],
      search_receipts: [{
        event_id: 'search:T1:c2', provider: 'bing', query_hash: 'sha256:q',
        query_redacted: '天气***', results: [{ url: 'https://example.com', title: 't' }],
        captured_at: '2026-10-18T00:00:00Z', request_hash: 'sha256:req',
        response_hash: 'sha256:res', external_data_decision: 'allowed',
      }],
    };
    const svc = await fakeService({ '/v1/plan': () => ({ plan: PLAN }), '/v1/execute': () => withSearch });
    const { app, store } = await buildApp(svc.url);
    await app.inject({ method: 'POST', url: `/api/v1/personal/tasks/${TASK.id}/run`, payload: {} });
    await waitFor(() => store.getTask(TASK.id)!.status === 'verified');

    const active = store.listTasks().find((t) => t.id === TASK.id)!;
    const rows = store.listSearchReceipts(
      (store.listTraces(TASK.id).find((t) => t.kind === 'execution') as any).execution_id,
    );
    expect(active.status).toBe('verified');
    expect(rows).toHaveLength(1);
    expect(rows[0].results).toEqual([{ url: 'https://example.com', title: 't' }]);
    svc.close(); store.close();
  });

  it('I1: a retried execution can overwrite its own trace (no PK collision)', async () => {
    const svc = await fakeService({ '/v1/plan': () => ({ plan: PLAN }), '/v1/execute': () => EXEC });
    const { app, store, executions } = await buildApp(svc.url);
    const { execution } = executions.claim(TASK.id, 1, 'o');
    store.saveTrace({ id: `trace_${execution.execution_id}_exec`, task_id: TASK.id, kind: 'execution', status: 'failed' });
    expect(() => store.saveTrace({
      id: `trace_${execution.execution_id}_exec`, task_id: TASK.id, kind: 'execution', status: 'verified',
    })).not.toThrow();
    expect((store.getTrace(`trace_${execution.execution_id}_exec`) as any).status).toBe('verified');
    svc.close(); store.close();
  });
});
