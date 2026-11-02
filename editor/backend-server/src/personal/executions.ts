/**
 * 持久化执行记录：原子 claim + 租约心跳 + 崩溃恢复。
 *
 * 三条不变量：
 * 1. 同一 task 同时最多一个活跃 execution（靠 004 的部分唯一索引）；
 * 2. claim 是条件插入，输者拿到赢者的 execution_id，不再启动第二个 Octop turn；
 * 3. 进程重启时扫描过期租约 → 标 recoverable，绝不静默当作成功；终态不可被过期写入改写。
 */
import { randomUUID } from 'node:crypto';
import { PersonalStore, nowIso } from './store';

export type ExecutionStatus =
  | 'queued' | 'running' | 'awaiting_confirmation' | 'recoverable'
  | 'interrupted' | 'verified' | 'failed' | 'blocked' | 'unverifiable';

export interface ExecutionRecord {
  execution_id: string;
  task_id: string;
  trace_id: string;
  contract_version: number;
  status: ExecutionStatus;
  attempt: number;
  lease_owner: string | null;
  lease_until: string | null;
  heartbeat_at: string | null;
  octop_agent_id: string | null;
  octop_thread_id: string | null;
  last_error: string | null;
  /** 恢复执行所需的 envelope + plan（JSON）；claim 后、dispatch 前写入。 */
  run_spec: string | null;
  created_at: string;
  updated_at: string;
}

/** claim 的可判别错误：Task 4 据此映射 404 / 409，而不是笼统的 500。 */
export class ExecutionClaimError extends Error {
  constructor(
    message: string,
    readonly reason: 'task_not_found' | 'contract_version_mismatch',
  ) {
    super(message);
    this.name = 'ExecutionClaimError';
  }
}

/**
 * 活跃状态集合。三处必须同步，改一处就要同时改三处：
 * 1. 本常量；
 * 2. 004_executions.sql 中 executions.status 的 CHECK 列表；
 * 3. 004_executions.sql 中 idx_executions_active_task 的 WHERE 子句。
 */
const ACTIVE = "('queued','running','awaiting_confirmation','recoverable')";

/**
 * 允许写入终态的状态。刻意排除 recoverable：它的语义是"进程退出、结果未知"，
 * 若允许 finish 就会把未知静默改写成 verified，直接违反本文件的不变量 3。
 * awaiting_confirmation 保留，因为用户拒绝确认时需要一个合法的终点。
 */
const FINISHABLE = "('queued','running','awaiting_confirmation')";

/** claim / resumeFromPark 的默认租约。 */
const DEFAULT_LEASE_MS = 60_000;

export class ExecutionStore {
  constructor(private store: PersonalStore) {}

  /** 底层 db；PersonalStore 未暴露连接，用受控访问避免业务层直接拼 SQL。 */
  private db(): any {
    return (this.store as any).db;
  }

  claim(
    taskId: string,
    contractVersion: number,
    owner: string,
  ): { execution: ExecutionRecord; created: boolean } {
    const db = this.db();
    db.exec('BEGIN IMMEDIATE');
    try {
      // 先校验请求契约与任务当前契约版本一致；否则拒绝，避免用旧契约启动。
      // 取值口径与 pipeline 路由一致：contract.contract_version ?? tasks.version ?? 1。
      const task = this.store.getTask(taskId);
      if (!task) {
        throw new ExecutionClaimError(`task not found: ${taskId}`, 'task_not_found');
      }
      const taskVersion = Number(
        (task.contract_version as number) ?? (task.version as number) ?? 1,
      );
      if (taskVersion !== contractVersion) {
        throw new ExecutionClaimError(
          `contract_version mismatch: task v${taskVersion}, request v${contractVersion}`,
          'contract_version_mismatch',
        );
      }

      const existing = db
        .prepare(`SELECT * FROM executions WHERE task_id = ? AND status IN ${ACTIVE}`)
        .get(taskId) as any;
      if (existing) {
        if (Number(existing.contract_version) !== contractVersion) {
          throw new ExecutionClaimError(
            `contract_version mismatch: active execution v${existing.contract_version}, request v${contractVersion}`,
            'contract_version_mismatch',
          );
        }
        db.exec('COMMIT');
        return { execution: this.row(existing), created: false };
      }

      const executionId = `exec_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
      const traceId = `tr_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
      const at = nowIso();
      db.prepare(`
        INSERT INTO executions (
          execution_id, task_id, trace_id, contract_version, status, attempt,
          lease_owner, lease_until, heartbeat_at, octop_agent_id, octop_thread_id,
          last_error, created_at, updated_at
        ) VALUES (?, ?, ?, ?, 'queued', 1, ?, ?, ?, NULL, NULL, NULL, ?, ?)
      `).run(
        executionId, taskId, traceId, contractVersion, owner,
        new Date(Date.now() + DEFAULT_LEASE_MS).toISOString(), at, at, at,
      );
      const row = db.prepare(`SELECT * FROM executions WHERE execution_id = ?`).get(executionId) as any;
      db.exec('COMMIT');
      return { execution: this.row(row), created: true };
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  }

  /** queued → running；只有仍持有租约的 owner 能推进，防止过期 claim 复活已终止的执行。 */
  markRunning(executionId: string, owner: string, leaseMs: number): void {
    const res = this.db().prepare(`
      UPDATE executions
      SET status = 'running', lease_owner = ?, lease_until = ?, heartbeat_at = ?, updated_at = ?
      WHERE execution_id = ? AND status = 'queued' AND lease_owner = ?
    `).run(
      owner,
      new Date(Date.now() + leaseMs).toISOString(),
      nowIso(),
      nowIso(),
      executionId,
      owner,
    );
    if (Number(res.changes) === 0) {
      throw new Error(`stale markRunning: ${executionId}`);
    }
  }

  /** 只有 running 的执行可以续租；terminal / recoverable / parked 一律不再延租。 */
  heartbeat(executionId: string, owner: string, leaseMs: number): void {
    this.db().prepare(`
      UPDATE executions
      SET heartbeat_at = ?, lease_until = ?, updated_at = ?
      WHERE execution_id = ? AND lease_owner = ? AND status = 'running'
    `).run(nowIso(), new Date(Date.now() + leaseMs).toISOString(), nowIso(), executionId, owner);
  }

  attachOctop(executionId: string, agentId: string, threadId: string): void {
    this.db().prepare(`
      UPDATE executions SET octop_agent_id = ?, octop_thread_id = ?, updated_at = ?
      WHERE execution_id = ?
    `).run(agentId, threadId, nowIso(), executionId);
  }

  /**
   * 内部状态推进；终态（不在 ACTIVE 内）之后不可再改写。
   * waiting 状态必须走 park()，否则会留下已过期的 claim 租约、把活跃槽永久占死。
   */
  setStatus(executionId: string, status: ExecutionStatus, error: string | null = null): void {
    if (status === 'awaiting_confirmation') {
      throw new Error(`use park() to enter awaiting_confirmation: ${executionId}`);
    }
    this.db().prepare(`
      UPDATE executions SET status = ?, last_error = ?, updated_at = ?
      WHERE execution_id = ? AND status IN ${ACTIVE}
    `).run(status, error, nowIso(), executionId);
  }

  /**
   * 进入等待确认：清空 60 秒 claim 租约，但保留活跃槽位。
   *
   * 语义选择：awaiting_confirmation 仍占用唯一索引的活跃槽——同一任务不应出现
   * 第二个执行；但它已无租约，必须能通过 resumeFromPark 重新接管，否则任务一旦
   * 进过 needs_confirmation 就永远无法再 claim。
   */
  park(executionId: string): void {
    const res = this.db().prepare(`
      UPDATE executions
      SET status = 'awaiting_confirmation', lease_owner = NULL, lease_until = NULL, updated_at = ?
      WHERE execution_id = ? AND status IN ('queued','running')
    `).run(nowIso(), executionId);
    if (Number(res.changes) === 0) {
      throw new Error(`stale park: ${executionId}`);
    }
  }

  /** awaiting_confirmation → queued：新 owner 接管并记一次新尝试。 */
  resumeFromPark(executionId: string, owner: string): void {
    const now = nowIso();
    const res = this.db().prepare(`
      UPDATE executions
      SET status = 'queued', lease_owner = ?, lease_until = ?, heartbeat_at = NULL,
          attempt = attempt + 1, updated_at = ?
      WHERE execution_id = ? AND status = 'awaiting_confirmation'
    `).run(owner, new Date(Date.now() + DEFAULT_LEASE_MS).toISOString(), now, executionId);
    if (Number(res.changes) === 0) {
      throw new Error(`stale resumeFromPark: ${executionId}`);
    }
  }

  /**
   * recoverable / interrupted → queued：崩溃后的人工重试入口。
   * 新 owner 接管并记一次新尝试；awaiting_confirmation 走 resumeFromPark。
   */
  requeue(executionId: string, owner: string): void {
    const now = nowIso();
    const res = this.db().prepare(`
      UPDATE executions
      SET status = 'queued', lease_owner = ?, lease_until = ?, heartbeat_at = NULL,
          attempt = attempt + 1, updated_at = ?
      WHERE execution_id = ? AND status IN ('recoverable','interrupted')
    `).run(owner, new Date(Date.now() + DEFAULT_LEASE_MS).toISOString(), now, executionId);
    if (Number(res.changes) === 0) {
      throw new Error(`stale requeue: ${executionId}`);
    }
  }

  /**
   * 接管一条租约已过期的 queued 执行（进程在 plan 阶段死掉留下的行）。
   * 只有真正过期的行才会被接管，避免抢走仍在进行中的请求。
   */
  adoptExpired(executionId: string, owner: string): boolean {
    const now = nowIso();
    const res = this.db().prepare(`
      UPDATE executions
      SET status = 'queued', lease_owner = ?, lease_until = ?, heartbeat_at = NULL,
          attempt = attempt + 1, updated_at = ?
      WHERE execution_id = ? AND status = 'queued'
        AND (lease_until IS NULL OR julianday(lease_until) < julianday(?))
    `).run(owner, new Date(Date.now() + DEFAULT_LEASE_MS).toISOString(), now, executionId, now);
    return Number(res.changes) === 1;
  }

  /** 记录恢复所需的调度参数（envelope + plan）；重试时覆盖写。 */
  saveRunSpec(executionId: string, spec: Record<string, unknown>): void {
    this.db()
      .prepare(`UPDATE executions SET run_spec = ?, updated_at = ? WHERE execution_id = ?`)
      .run(JSON.stringify(spec), nowIso(), executionId);
  }

  getRunSpec(executionId: string): Record<string, unknown> | null {
    const row = this.db()
      .prepare(`SELECT run_spec FROM executions WHERE execution_id = ?`)
      .get(executionId) as any;
    if (!row?.run_spec) return null;
    try {
      return JSON.parse(row.run_spec) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  /**
   * 终态写入。仅允许仍处于 FINISHABLE 的状态；传入 owner 时还要求租约匹配。
   * recoverable 不在 FINISHABLE 内，因此崩溃恢复后迟到的 finish 无法把它覆盖成
   * verified——这是不变量 3 的最后一道闸。
   */
  finish(executionId: string, status: ExecutionStatus, error: string | null = null, owner?: string): void {
    const ownerClause = owner === undefined ? '' : ' AND (lease_owner IS NULL OR lease_owner = ?)';
    const params: any[] = [status, error, nowIso(), executionId];
    if (owner !== undefined) params.push(owner);
    const res = this.db().prepare(`
      UPDATE executions
      SET status = ?, last_error = ?, lease_owner = NULL, lease_until = NULL, updated_at = ?
      WHERE execution_id = ? AND status IN ${FINISHABLE}${ownerClause}
    `).run(...params);
    if (Number(res.changes) === 0) {
      throw new Error(`stale finish: ${executionId}`);
    }
  }

  get(executionId: string): ExecutionRecord | null {
    const row = this.db()
      .prepare(`SELECT * FROM executions WHERE execution_id = ?`)
      .get(executionId) as any;
    return row ? this.row(row) : null;
  }

  listActive(taskId: string): ExecutionRecord[] {
    return (this.db()
      .prepare(`SELECT * FROM executions WHERE task_id = ? AND status IN ${ACTIVE}`)
      .all(taskId) as any[]).map((r) => this.row(r));
  }

  /**
   * 启动时调用：过期租约的活跃执行标为 recoverable，并把对应 task 从 running
   * 释放为 blocked（否则路由对 running 任务仍返回 409，用户看到的状态依旧卡死）。
   */
  recoverExpired(now = new Date()): ExecutionRecord[] {
    const db = this.db();
    const at = nowIso();
    db.exec('BEGIN IMMEDIATE');
    try {
      const rows = db.prepare(`
        UPDATE executions
        SET status = 'recoverable', lease_owner = NULL, lease_until = NULL,
            last_error = ?, updated_at = ?
        WHERE status IN ('running','queued')
          AND lease_until IS NOT NULL
          AND lease_until < ?
        RETURNING *
      `).all('进程在租约到期前退出，执行状态未知', at, now.toISOString()) as any[];

      for (const r of rows) {
        // 只在 task 仍是 running 时改写，避免覆盖用户已经推进过的状态。
        db.prepare(`
          UPDATE tasks SET status = 'blocked', updated_at = ? WHERE id = ? AND status = 'running'
        `).run(at, r.task_id);
        this.store.audit('system', 'task.recovered', 'task', r.task_id, {
          execution_id: r.execution_id,
        });
      }
      db.exec('COMMIT');
      return rows.map((r) => this.row(r));
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  }

  private row(r: any): ExecutionRecord {
    return {
      execution_id: r.execution_id, task_id: r.task_id, trace_id: r.trace_id,
      contract_version: Number(r.contract_version), status: r.status,
      attempt: Number(r.attempt), lease_owner: r.lease_owner,
      lease_until: r.lease_until, heartbeat_at: r.heartbeat_at,
      octop_agent_id: r.octop_agent_id, octop_thread_id: r.octop_thread_id,
      last_error: r.last_error, run_spec: r.run_spec ?? null,
      created_at: r.created_at, updated_at: r.updated_at,
    };
  }
}
