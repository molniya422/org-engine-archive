/**
 * P4.4 阶段二 — pipeline orchestration over the Python decision service.
 *
 * 数据流（单向）：
 *   task contract + rules → POST /v1/plan
 *     → blocked / ask_user / policy_error → 落库，不执行
 *     → needs_confirmation → park，等用户带上 token 再续跑
 *     → select → claim execution → POST /v1/execute → receipts → evidence → 终态
 *
 * 不变量：
 * - 同一 task 同时只有一个活跃 execution（ExecutionStore 原子 claim）；
 * - 终态之前必须先落 evidence/trace，否则任务不能标 verified；
 * - verified 只认 "turn 正常结束 + 无错误 + 回执验证通过" 的交集，超时/报错一律不算；
 * - 执行失败映射为 recoverable/failed，绝不静默成功；
 * - task 状态写入带契约版本栅栏，在飞执行不能改写已变更的合同。
 */
import { FastifyInstance } from 'fastify';
import { PersonalStore } from './store';
import { buildTaskEnvelope, normalizeNetworkPolicy, type NetworkPolicy } from './task-envelope';
import { ExecutionStore, ExecutionClaimError, type ExecutionRecord } from './executions';
import { callService, ServiceUnavailableError } from './service-client';
import { checkReadiness } from './route-guard';

export interface OctopConfig {
  base_url: string;
  username: string;
  password: string;
  agent_name: string;
  workspace_root: string;
  allow_remote?: boolean;
}

export interface PipelineOptions {
  store: PersonalStore;
  serviceUrl: string;
  octop: OctopConfig | null;
  executions: ExecutionStore;
}

interface PlanEnvelope {
  trace_id: string;
  task_id: string;
  contract_version: number;
  policy_version: string;
  candidates: Array<Record<string, unknown>>;
  verdict: string;
  selected_action: string | null;
  reason: string;
  missing_information: string[];
  rule_refs: string[];
  requires_confirmation: boolean;
  network_policy?: NetworkPolicy;
}

/** 等待用户确认的那个动作：只放用户能读懂的内容，不放内部 hash/token。 */
interface PendingAction {
  action_id: string | null;
  kind: string;
  description: string;
  parameters: Record<string, unknown>;
}

interface ExecuteReport {
  status: string;
  error: string | null;
  final_text: string;
  overall_verification: string;
  events: Array<Record<string, unknown>>;
  receipts: Array<Record<string, unknown>>;
  verifications: Array<Record<string, unknown>>;
  hitl_log: Array<Record<string, unknown>>;
  search_decisions?: Array<Record<string, unknown>>;
  search_receipts?: Array<Record<string, unknown>>;
}

/** 租约与执行超时对齐：turn 可能跑满 30 分钟，租约绝不能更短。 */
const LEASE_MS = 60 * 60_000;
const HEARTBEAT_MS = Math.floor(LEASE_MS / 3);

export function registerPipelineRoutes(app: FastifyInstance, opts: PipelineOptions): void {
  const { store, serviceUrl, octop, executions } = opts;
  const owner = `pipeline-${process.pid}`;

  function leaseExpired(execution: ExecutionRecord): boolean {
    return !execution.lease_until || new Date(execution.lease_until).getTime() < Date.now();
  }

  /**
   * 带契约版本栅栏的状态写入：版本不符或任务已终态时不生效。
   * 拒绝只记 audit，不抛错——在飞执行的失败不应把路由变成 500。
   */
  function setTaskStatus(taskId: string, expectedVersion: number, status: string): boolean {
    const ok = store.updateTaskStatus(taskId, expectedVersion, status);
    if (!ok) {
      store.audit('system', 'task.status_rejected', 'task', taskId, {
        status, expected_version: expectedVersion,
      });
    }
    return ok;
  }

  /** 只有当该 execution 仍是 task 的活跃执行时，才有资格改 task 状态。 */
  function isActiveExecution(execution: ExecutionRecord): boolean {
    return executions
      .listActive(execution.task_id)
      .some((r) => r.execution_id === execution.execution_id);
  }

  /**
   * 把执行落到"结果未知"。finish() 刻意不接受 recoverable（防止把它覆盖成
   * 终态），所以这里走 setStatus——它只允许活跃状态，正好表达"还没结论"。
   */
  function markRecoverable(executionId: string, msg: string): void {
    executions.setStatus(executionId, 'recoverable', msg);
  }

  /**
   * 待确认动作的用户可读描述：候选动作 + 合同里用户写的确认点。
   * 确认点是用户自己的话，优先展示；没有则退回中性说明。
   */
  function buildPending(plan: PlanEnvelope, task: Record<string, unknown>): PendingAction {
    const candidates = Array.isArray(plan.candidates) ? plan.candidates : [];
    const selected = (candidates.find((c) => c.id === plan.selected_action) ?? candidates[0] ?? {}) as Record<string, unknown>;
    const points = Array.isArray(task.confirmation_points) ? task.confirmation_points : [];
    const point = (points[0] ?? {}) as Record<string, unknown>;
    return {
      action_id: plan.selected_action,
      kind: typeof point.action_kind === 'string' ? point.action_kind
        : typeof selected.kind === 'string' ? selected.kind : 'unknown',
      description: typeof point.description === 'string'
        ? point.description : '执行前需要你确认',
      parameters: (selected.parameters as Record<string, unknown>) ?? {},
    };
  }

  async function executeRun(
    execution: ExecutionRecord,
    envelope: Record<string, unknown>,
    plan: PlanEnvelope,
  ): Promise<void> {
    // 心跳：长 turn 期间续租，避免启动恢复把"还活着"的执行标成 recoverable。
    const heartbeat = setInterval(() => {
      try {
        executions.heartbeat(execution.execution_id, owner, LEASE_MS);
      } catch { /* 终态后心跳失败是正常的 */ }
    }, HEARTBEAT_MS);
    heartbeat.unref?.();

    try {
      try {
        executions.markRunning(execution.execution_id, owner, LEASE_MS);
      } catch {
        // 已不归本进程（被恢复接管 / 已终态）：绝不启动第二个 Octop turn。
        store.audit('system', 'execution.dispatch_skipped', 'execution', execution.execution_id, {});
        return;
      }
      setTaskStatus(execution.task_id, execution.contract_version, 'running');

      const report = await callService<ExecuteReport>(
        // 实测：38 个工具的 prompt ~19k tokens，prefill 就要 ~25 分钟，
        // 加上生成，35 分钟会卡在边界上。给足 60 分钟，由 Python 侧的
        // timeout_s（55 分钟）作为真正的业务上限。
        { baseUrl: serviceUrl, timeoutMs: 60 * 60_000 },
        '/v1/execute',
        {
          plan,
          rules: store.listRules('active'),
          allowed_scopes: envelope.allowed_scopes,
          // 计划级确认已在 TS 侧完成；runtime HITL 由 Python 门禁自行签发 token。
          // 传任意 token 都会被 gate 当作"别的动作的确认"而拒绝所有调用。
          confirmation_token: null,
          contract_version: envelope.contract_version,
          execution_id: execution.execution_id,
          octop,
          // Python 字段单位是秒；外层 fetch timeout 是毫秒 —— 两者不可混用。
          timeout_s: 55 * 60,
        },
      );

      // 1) 证据先落库：任何一条落库失败都会进 catch，任务绝不会被标 verified。
      for (const r of report.receipts ?? []) {
        const ev = r.evidence as Record<string, unknown> | undefined;
        if (ev && typeof ev.id === 'string') {
          store.saveEvidence({ ...ev, supports: [execution.task_id] });
        }
      }

      // 2) 搜索回执单独落库（query 只有 hash + 脱敏文本，可审计）。
      for (const sr of report.search_receipts ?? []) {
        const results = (sr.results as Array<Record<string, unknown>>) ?? [];
        store.saveSearchReceipt({
          event_id: String(sr.event_id),
          execution_id: execution.execution_id,
          provider: String(sr.provider),
          query_hash: String(sr.query_hash),
          query_redacted: String(sr.query_redacted),
          results,
          captured_at: String(sr.captured_at),
          request_hash: String(sr.request_hash),
          response_hash: String(sr.response_hash),
          external_data_decision: String(sr.external_data_decision),
        });
      }

      // 3) 唯一可信的成功：turn 正常结束 + 无错误 + 回执验证通过。
      //    超时的 turn 也可能写了一个文件、回执全绿 —— 那不是完成，是半成品。
      const trusted =
        report.status === 'done' &&
        report.error == null &&
        report.overall_verification === 'verified';

      // 4) trace（证据已落库之后）。
      store.saveTrace({
        id: `trace_${execution.execution_id}_exec`,
        task_id: execution.task_id,
        kind: 'execution',
        execution_id: execution.execution_id,
        status: report.overall_verification,
        report_status: report.status,
        trusted,
        final_text: report.final_text,
        events: report.events,
        verifications: report.verifications,
        hitl_log: report.hitl_log,
        search_decisions: report.search_decisions ?? [],
        error: report.error,
        created_at: new Date().toISOString(),
      });

      // 5) 终态：证据/trace 已持久化，才允许翻转状态。
      const finalTaskStatus = trusted ? 'verified' : 'blocked';
      const finalExecStatus = trusted ? 'verified'
        : report.status === 'timeout' ? 'recoverable'
          : report.status === 'error' ? 'blocked'
            : report.overall_verification === 'failed' ? 'failed'
              : 'unverifiable';
      // finish 先落（失败会抛出），确保 stale fence 时 task 不会被误标 verified。
      executions.finish(execution.execution_id, finalExecStatus, report.error, owner);
      setTaskStatus(execution.task_id, execution.contract_version, finalTaskStatus);
    } catch (e) {
      // 保留底层原因：ServiceUnavailableError.detail 里有 fetch/超时的真实报错，
      // 只写 message 会让 trace 变成 "request failed" 这种无法定位的记录。
      const base = e instanceof Error ? e.message : String(e);
      const detail = e instanceof ServiceUnavailableError && e.detail ? ` — ${e.detail}` : '';
      const msg = `${base}${detail}`;
      const kind = e instanceof ServiceUnavailableError ? 'recoverable' : 'failed';
      // 失败轨迹尽力落库；落库失败也不能阻止 execution 落到非成功终态。
      try {
        store.saveTrace({
          id: `trace_${execution.execution_id}_exec`,
          task_id: execution.task_id,
          kind: 'execution',
          execution_id: execution.execution_id,
          status: kind,
          error: msg,
          created_at: new Date().toISOString(),
        });
      } catch (traceErr) {
        app.log.error({ err: traceErr, execution_id: execution.execution_id }, 'failed to save failure trace');
      }
      const wasActive = isActiveExecution(execution);
      try {
        if (kind === 'recoverable') markRecoverable(execution.execution_id, msg);
        else executions.finish(execution.execution_id, kind, msg, owner);
      } catch {
        // 租约已不归本进程（如启动恢复已接管）：不覆盖真实状态。
        store.audit('system', 'execution.finish_skipped', 'execution', execution.execution_id, {
          error: msg,
        });
      }
      // 不让过期执行覆盖新执行/用户已推进的状态。
      if (wasActive) setTaskStatus(execution.task_id, execution.contract_version, 'blocked');
    } finally {
      clearInterval(heartbeat);
    }
  }

  /** 派发一次执行；run_spec 供 /resume 在重启后重放。 */
  function dispatch(
    execution: ExecutionRecord,
    envelope: Record<string, unknown>,
    plan: PlanEnvelope,
  ): void {
    executions.saveRunSpec(execution.execution_id, { envelope, plan });
    void executeRun(execution, envelope, plan).catch((e) => {
      // 后台任务绝不能留下 unhandled rejection（进程退出时 store 可能已关闭）。
      app.log.error({ err: e, execution_id: execution.execution_id }, 'executeRun crashed');
    });
  }

  /**
   * claim 之后的主流程：envelope → plan → 分流。
   * 调用方负责把异常兜底成 recoverable。
   */
  async function startRun(
    execution: ExecutionRecord,
    task: Record<string, unknown>,
    contract: number,
  ): Promise<{ code: number; body: Record<string, unknown> }> {
    // TaskEnvelope 只装合同本身；confirmation_token 是执行期参数，不能混进去。
    // 实测：把它展开进 envelope 会让 Python `TaskEnvelope(**task)` 抛
    // TypeError: unexpected keyword argument 'confirmation_token'，plan 永远失败。
    const envelope = buildTaskEnvelope({
      contract_version: contract,
      policy_version: 'baseline-0.1',
      trace_id: execution.trace_id,
      task_id: task.id,
      intent_id: String(task.id),
      conversation_id: 'dashboard',
      goal: task.goal,
      redacted_state: {},
      evidence_refs: [],
      budget: {},
      allowed_scopes: (task.allowed_scopes as string[]) ?? ['workspace/'],
      forbidden_actions: (task.forbidden_actions as string[]) ?? ['external_send', 'delete', 'payment', 'submit'],
      confirmation_points: Array.isArray(task.confirmation_points) ? task.confirmation_points : [],
      network_policy: normalizeNetworkPolicy(task.network_policy),
    }) as unknown as Record<string, unknown>;

    let plan: PlanEnvelope;
    try {
      const out = await callService<{ plan: PlanEnvelope }>(
        { baseUrl: serviceUrl, timeoutMs: 60_000 },
        '/v1/plan',
        { task: envelope, rules: store.listRules('active') },
      );
      plan = out.plan;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      try {
        markRecoverable(execution.execution_id, msg);
      } catch { /* 已终态 */ }
      setTaskStatus(String(task.id), contract, 'blocked');
      return {
        code: 503,
        body: {
          error: 'decision_service_unreachable', detail: msg,
          recoverable: true, execution_id: execution.execution_id,
        },
      };
    }

    store.saveTrace({
      id: `trace_${execution.trace_id}_plan`,
      task_id: String(task.id),
      kind: 'plan',
      execution_id: execution.execution_id,
      verdict: plan.verdict,
      selected_action: plan.selected_action,
      reason: plan.reason,
      policy_version: plan.policy_version,
      missing_information: plan.missing_information,
      created_at: new Date().toISOString(),
    });

    // 等确认：park（清租约、保留活跃槽）；用户显式 confirm/reject 后再续跑。
    if (plan.verdict === 'needs_confirmation' || (plan.verdict === 'select' && plan.requires_confirmation)) {
      // 先存 run_spec：进程若在 park 与用户确认之间死掉，重启后仍能展示并执行同一份计划。
      const pending = buildPending(plan, task);
      executions.saveRunSpec(execution.execution_id, { envelope, plan, pending });
      executions.park(execution.execution_id);
      setTaskStatus(String(task.id), contract, 'awaiting_confirmation');
      return {
        code: 200,
        body: {
          plan, execution_id: execution.execution_id, status: 'awaiting_confirmation',
          missing_information: plan.missing_information, needs_confirmation: true, pending,
        },
      };
    }

    // 只有 select 才允许执行。blocked / ask_user / policy_error / 未知 verdict
    // 一律 blocked —— policy_error 的 candidates 为空，放行会打成 500。
    if (plan.verdict !== 'select') {
      executions.finish(execution.execution_id, 'blocked', plan.reason || plan.verdict, owner);
      setTaskStatus(String(task.id), contract, 'blocked');
      store.audit('system', 'plan.rejected', 'task', String(task.id), {
        verdict: plan.verdict, reason: plan.reason,
      });
      return { code: 200, body: { plan, execution_id: execution.execution_id, status: 'blocked' } };
    }

    // select — 异步执行（本地模型慢，回合可能十几分钟）。
    setTaskStatus(String(task.id), contract, 'planned');
    dispatch(execution, envelope, plan);
    return {
      code: 202,
      body: {
        plan, execution_id: execution.execution_id,
        trace_id: execution.trace_id, status: 'running',
      },
    };
  }

  /** claim 之后的异常兜底：释放 claim，返回 503 带 execution_id。 */
  async function runWithClaim(
    execution: ExecutionRecord,
    task: Record<string, unknown>,
    contract: number,
  ): Promise<{ code: number; body: Record<string, unknown> }> {
    try {
      return await startRun(execution, task, contract);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      try {
        markRecoverable(execution.execution_id, msg);
      } catch { /* 已终态 */ }
      return {
        code: 503,
        body: { error: 'run_setup_failed', detail: msg, execution_id: execution.execution_id, recoverable: true },
      };
    }
  }

  app.post<{ Params: { id: string } }>('/api/v1/personal/tasks/:id/run', async (req, reply) => {
    const task = store.getTask(req.params.id) as Record<string, unknown> | null;
    if (!task) { reply.code(404); return { error: 'task not found' }; }
    if (!octop) {
      reply.code(503);
      return { error: 'octop_not_configured', recoverable: true, hint: 'set OCTOP_* env vars' };
    }

    // 设置是唯一真源：工作区必须与 Octop 配置一致，否则任务会落到错误目录。
    // 两侧可能一个用 / 一个用 \（onboarding 输入与 env 配置），先统一分隔符再比。
    const settingsRow = (store as any).db
      .prepare(`SELECT settings FROM personal_settings WHERE id = 'personal_settings_singleton'`)
      .get() as any;
    if (settingsRow) {
      const settings = JSON.parse(settingsRow.settings) as { workspace?: string };
      const norm = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
      const configured = settings.workspace ? norm(settings.workspace) : '';
      if (configured && octop.workspace_root) {
        const root = norm(octop.workspace_root);
        // 只接受同一目录或子目录：D:/data 不能放行 D:/data2。
        if (root !== configured && !root.startsWith(`${configured}/`)) {
          reply.code(409);
          return {
            error: 'workspace_mismatch',
            detail: `设置里的工作区是 ${settings.workspace}，但执行目录是 ${octop.workspace_root}`,
            recoverable: true,
          };
        }
      }
    }

    // 依赖没就绪时立刻给出可读诊断，而不是在 35 分钟的 turn 里失败。
    const readiness = await checkReadiness({ serviceUrl, octop });
    if (!readiness.ready) {
      reply.code(503);
      return {
        error: 'not_ready',
        detail: readiness.reason,
        checks: readiness.checks,
        recoverable: true,
      };
    }

    const contract = (task.contract_version ?? task.version ?? 1) as number;

    let claim: { execution: ExecutionRecord; created: boolean };
    try {
      claim = executions.claim(String(task.id), contract, owner);
    } catch (e) {
      if (e instanceof ExecutionClaimError) {
        if (e.reason === 'task_not_found') {
          reply.code(404);
          return { error: 'task not found' };
        }
        reply.code(409);
        return { error: 'contract_version_conflict', detail: e.message, recoverable: true };
      }
      throw e;
    }

    if (claim.created) {
      const r = await runWithClaim(claim.execution, task, contract);
      reply.code(r.code);
      return r.body;
    }

    const existing = claim.execution;

    // 等确认中的执行：不是"再跑一次"，而是等用户显式 confirm/reject。
    // 任意字符串 token 都不构成确认——那个概念属于 runtime HITL，不是计划审批。
    if (existing.status === 'awaiting_confirmation') {
      const spec = executions.getRunSpec(existing.execution_id);
      return {
        execution_id: existing.execution_id, status: existing.status,
        reused: true, needs_confirmation: true,
        pending: spec?.pending ?? null,
      };
    }

    // C3：崩溃/失败留下的 recoverable 行仍占活跃槽。租约已清空，旧 owner
    // 必然已死，因此下一次 /run 直接接管重跑，而不是永远返回 reused。
    if (existing.status === 'recoverable' || existing.status === 'interrupted') {
      try {
        executions.requeue(existing.execution_id, owner);
      } catch (e) {
        reply.code(409);
        return { error: 'execution_not_resumable', detail: (e as Error).message };
      }
      const r = await runWithClaim(
        executions.get(existing.execution_id)!, task, contract,
      );
      reply.code(r.code);
      return r.body;
    }

    // C3：进程在 plan 阶段死掉留下的 queued 行 —— 租约过期后由下一次 /run 接管。
    if (existing.status === 'queued' && leaseExpired(existing)
        && executions.adoptExpired(existing.execution_id, owner)) {
      const adopted = executions.get(existing.execution_id)!;
      const spec = executions.getRunSpec(existing.execution_id);
      if (spec) {
        setTaskStatus(String(task.id), contract, 'planned');
        dispatch(adopted, spec.envelope as Record<string, unknown>,
                 spec.plan as PlanEnvelope);
        reply.code(202);
        return {
          execution_id: adopted.execution_id, trace_id: adopted.trace_id,
          status: 'running', adopted: true,
        };
      }
      const r = await runWithClaim(adopted, task, contract);
      reply.code(r.code);
      return r.body;
    }

    return {
      execution_id: existing.execution_id,
      status: existing.status,
      reused: true,
    };
  });

  app.get<{ Params: { id: string } }>(
    '/api/v1/personal/executions/:id',
    async (req, reply) => {
      const execution = executions.get(req.params.id);
      if (!execution) { reply.code(404); return { error: 'execution not found' }; }
      // 等待确认时带上待确认动作：页面刷新 / 轮询都能恢复展示，不用另开端点。
      const spec = execution.status === 'awaiting_confirmation'
        ? executions.getRunSpec(execution.execution_id) : null;
      return { execution: { ...execution, pending: spec?.pending ?? null } };
    },
  );

  /** 用户点了"确认执行"：执行用户看过的那一份计划，绝不重新规划。 */
  app.post<{ Params: { id: string } }>(
    '/api/v1/personal/executions/:id/confirm',
    async (req, reply) => {
      const execution = executions.get(req.params.id);
      if (!execution) { reply.code(404); return { error: 'execution not found' }; }
      if (execution.status !== 'awaiting_confirmation') {
        reply.code(409);
        return { error: 'execution_not_waiting', detail: `execution is ${execution.status}` };
      }

      const task = store.getTask(execution.task_id) as Record<string, unknown> | null;
      const taskVersion = Number(task?.contract_version ?? task?.version ?? 1);
      if (!task || taskVersion !== execution.contract_version) {
        reply.code(409);
        return { error: 'contract_version_conflict', recoverable: false };
      }

      const spec = executions.getRunSpec(execution.execution_id);
      if (!spec?.envelope || !spec?.plan) {
        reply.code(409);
        return { error: 'execution_not_resumable', detail: '没有保存的计划，请重新发起' };
      }

      try {
        executions.resumeFromPark(execution.execution_id, owner);
      } catch (e) {
        reply.code(409);
        return { error: 'execution_not_resumable', detail: (e as Error).message };
      }
      const resumed = executions.get(execution.execution_id)!;
      setTaskStatus(resumed.task_id, resumed.contract_version, 'planned');
      dispatch(
        resumed,
        spec.envelope as Record<string, unknown>,
        spec.plan as PlanEnvelope,
      );
      reply.code(202);
      return { execution_id: resumed.execution_id, status: 'running' };
    },
  );

  /** 用户点了"不执行"：执行终止，任务记为已取消；不产生任何 Octop turn。 */
  app.post<{ Params: { id: string } }>(
    '/api/v1/personal/executions/:id/reject',
    async (req, reply) => {
      const execution = executions.get(req.params.id);
      if (!execution) { reply.code(404); return { error: 'execution not found' }; }
      if (execution.status !== 'awaiting_confirmation') {
        reply.code(409);
        return { error: 'execution_not_waiting', detail: `execution is ${execution.status}` };
      }

      const task = store.getTask(execution.task_id) as Record<string, unknown> | null;
      const taskVersion = Number(task?.contract_version ?? task?.version ?? 1);
      if (!task || taskVersion !== execution.contract_version) {
        reply.code(409);
        return { error: 'contract_version_conflict', recoverable: false };
      }

      try {
        executions.finish(execution.execution_id, 'blocked', '用户选择不执行');
      } catch (e) {
        reply.code(409);
        return { error: 'execution_not_resumable', detail: (e as Error).message };
      }
      setTaskStatus(execution.task_id, execution.contract_version, 'cancelled');
      store.audit('user', 'execution.rejected', 'execution', execution.execution_id, {});
      return { execution_id: execution.execution_id, status: 'blocked', task_status: 'cancelled' };
    },
  );

  app.post<{ Params: { id: string } }>(
    '/api/v1/personal/executions/:id/resume',
    async (req, reply) => {
      const execution = executions.get(req.params.id);
      if (!execution) { reply.code(404); return { error: 'execution not found' }; }
      if (execution.status !== 'recoverable' && execution.status !== 'interrupted') {
        reply.code(409);
        return { error: `execution is ${execution.status}`, recoverable: false };
      }

      const task = store.getTask(execution.task_id) as Record<string, unknown> | null;
      const taskVersion = Number(task?.contract_version ?? task?.version ?? 1);
      if (!task || taskVersion !== execution.contract_version) {
        reply.code(409);
        return { error: 'contract_version_conflict', recoverable: false };
      }

      const spec = executions.getRunSpec(execution.execution_id);
      try {
        executions.requeue(execution.execution_id, owner);
      } catch (e) {
        reply.code(409);
        return { error: 'execution_not_resumable', detail: (e as Error).message };
      }
      const requeued = executions.get(execution.execution_id)!;

      // 有 run_spec 才能立刻重放；没有则下一次 /run 会接管这条 queued 行。
      if (spec) {
        setTaskStatus(requeued.task_id, requeued.contract_version, 'planned');
        dispatch(
          requeued,
          spec.envelope as Record<string, unknown>,
          spec.plan as PlanEnvelope,
        );
      }
      reply.code(202);
      return {
        execution_id: requeued.execution_id,
        status: 'queued',
        ...(spec ? {} : { needs_rerun: true }),
      };
    },
  );
}
