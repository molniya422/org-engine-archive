import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { PersonalStore } from '../src/personal/store';
import { ExecutionStore, ExecutionClaimError } from '../src/personal/executions';

const TMP = join(process.cwd(), '.tmp-execution-recovery');

function rmRf(p: string): void {
  try { rmSync(p, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }); } catch { /* windows */ }
}

const TASK = {
  schema_version: 1, id: 'task_exec_01', goal: '整理材料',
  success_criteria: ['生成汇总'], allowed_scopes: ['workspace/'],
  forbidden_actions: ['external_send'], required_evidence: ['file_ref'],
  risk_level: 'low', confirmation_points: [], status: 'draft', version: 1,
  created_at: '2026-10-23T00:00:00Z',
};

function fresh(taskOverrides: Record<string, unknown> = {}): { store: PersonalStore; exec: ExecutionStore } {
  const store = new PersonalStore({ dbPath: join(TMP, 'personal.sqlite') });
  store.saveTaskWithEvidence({ ...TASK, ...taskOverrides } as any, []);
  return { store, exec: new ExecutionStore(store) };
}

beforeEach(() => { rmRf(TMP); mkdirSync(TMP, { recursive: true }); });
afterAll(() => rmRf(TMP));

describe('ExecutionStore.claim', () => {
  it('first claim wins and returns created=true', () => {
    const { store, exec } = fresh();
    const a = exec.claim('task_exec_01', 1, 'owner-a');
    expect(a.created).toBe(true);
    expect(a.execution.status).toBe('queued');
    expect(a.execution.execution_id).toMatch(/^exec_/);
    store.close();
  });

  it('second claim returns the SAME execution (no duplicate Octop turn)', () => {
    const { store, exec } = fresh();
    const a = exec.claim('task_exec_01', 1, 'owner-a');
    const b = exec.claim('task_exec_01', 1, 'owner-b');
    expect(b.created).toBe(false);
    expect(b.execution.execution_id).toBe(a.execution.execution_id);
    expect(exec.listActive('task_exec_01')).toHaveLength(1);
    store.close();
  });

  it('claim rejects a mismatched contract version', () => {
    const { store, exec } = fresh();
    try {
      exec.claim('task_exec_01', 99, 'owner-a');
      throw new Error('expected claim to throw');
    } catch (e) {
      expect(e).toBeInstanceOf(ExecutionClaimError);
      expect((e as ExecutionClaimError).reason).toBe('contract_version_mismatch');
    }
    store.close();
  });

  it('claim reports task_not_found for an unknown task', () => {
    const { store, exec } = fresh();
    try {
      exec.claim('task_does_not_exist', 1, 'owner-a');
      throw new Error('expected claim to throw');
    } catch (e) {
      expect(e).toBeInstanceOf(ExecutionClaimError);
      expect((e as ExecutionClaimError).reason).toBe('task_not_found');
    }
    store.close();
  });
});

describe('ExecutionStore recovery', () => {
  it('expired running lease becomes recoverable on startup scan', () => {
    const { store, exec } = fresh({ status: 'running' });
    const { execution } = exec.claim('task_exec_01', 1, 'dead-owner');
    exec.markRunning(execution.execution_id, 'dead-owner', -60_000);
    const recovered = exec.recoverExpired();
    expect(recovered).toHaveLength(1);
    expect(exec.get(execution.execution_id)!.status).toBe('recoverable');
    store.close();
  });

  it('recovery releases the task from running to blocked and audits it', () => {
    const { store, exec } = fresh({ status: 'running' });
    const { execution } = exec.claim('task_exec_01', 1, 'dead-owner');
    exec.markRunning(execution.execution_id, 'dead-owner', -60_000);
    const recovered = exec.recoverExpired();
    expect(recovered).toHaveLength(1);
    expect(recovered[0].task_id).toBe('task_exec_01');
    // 返回的是 UPDATE 后的新快照，租约已清空。
    expect(recovered[0].status).toBe('recoverable');
    expect(recovered[0].lease_owner).toBeNull();
    expect(store.getTask('task_exec_01')!.status).toBe('blocked');
    const audits = store.listAudit(20).filter((a) => a.event === 'task.recovered');
    expect(audits).toHaveLength(1);
    expect(JSON.parse(audits[0].detail)).toEqual({ execution_id: execution.execution_id });
    store.close();
  });

  it('a live lease is NOT recovered', () => {
    const { store, exec } = fresh();
    const { execution } = exec.claim('task_exec_01', 1, 'live-owner');
    exec.markRunning(execution.execution_id, 'live-owner', 60_000);
    expect(exec.recoverExpired()).toHaveLength(0);
    expect(exec.get(execution.execution_id)!.status).toBe('running');
    store.close();
  });

  it('heartbeat extends the lease', () => {
    const { store, exec } = fresh();
    const { execution } = exec.claim('task_exec_01', 1, 'o');
    exec.markRunning(execution.execution_id, 'o', 1000);
    const before = exec.get(execution.execution_id)!.lease_until!;
    exec.heartbeat(execution.execution_id, 'o', 600_000);
    const after = exec.get(execution.execution_id)!.lease_until!;
    expect(new Date(after).getTime()).toBeGreaterThan(new Date(before).getTime());
    store.close();
  });

  it('terminal status frees the active slot so a retry can claim', () => {
    const { store, exec } = fresh();
    const a = exec.claim('task_exec_01', 1, 'o');
    exec.finish(a.execution.execution_id, 'blocked', '第一次失败');
    const b = exec.claim('task_exec_01', 1, 'o2');
    expect(b.created).toBe(true);
    expect(b.execution.execution_id).not.toBe(a.execution.execution_id);
    store.close();
  });
});

describe('ExecutionStore fencing', () => {
  it('a stale markRunning cannot resurrect a finished execution', () => {
    const { store, exec } = fresh();
    const { execution } = exec.claim('task_exec_01', 1, 'o');
    exec.markRunning(execution.execution_id, 'o', 60_000);
    exec.finish(execution.execution_id, 'verified');
    expect(() => exec.markRunning(execution.execution_id, 'o', 60_000)).toThrow(/stale markRunning/);
    expect(exec.get(execution.execution_id)!.status).toBe('verified');
    store.close();
  });

  it('a late finish cannot overwrite recoverable with verified', () => {
    const { store, exec } = fresh({ status: 'running' });
    const { execution } = exec.claim('task_exec_01', 1, 'dead-owner');
    exec.markRunning(execution.execution_id, 'dead-owner', -60_000);
    exec.recoverExpired();
    expect(() => exec.finish(execution.execution_id, 'verified')).toThrow(/stale finish/);
    expect(exec.get(execution.execution_id)!.status).toBe('recoverable');
    store.close();
  });

  it('a heartbeat cannot extend a recovered execution', () => {
    const { store, exec } = fresh({ status: 'running' });
    const { execution } = exec.claim('task_exec_01', 1, 'dead-owner');
    exec.markRunning(execution.execution_id, 'dead-owner', -60_000);
    exec.recoverExpired();
    exec.heartbeat(execution.execution_id, 'dead-owner', 600_000);
    expect(exec.get(execution.execution_id)!.lease_until).toBeNull();
    store.close();
  });
});

describe('ExecutionStore awaiting_confirmation', () => {
  it('park keeps the slot but releases the lease; resumeFromPark re-queues with a new attempt', () => {
    const { store, exec } = fresh();
    const { execution } = exec.claim('task_exec_01', 1, 'o');
    exec.markRunning(execution.execution_id, 'o', 60_000);
    exec.park(execution.execution_id);

    const parked = exec.get(execution.execution_id)!;
    expect(parked.status).toBe('awaiting_confirmation');
    expect(parked.lease_owner).toBeNull();
    expect(parked.lease_until).toBeNull();
    // 仍占活跃槽：同一任务不能出现第二个执行。
    expect(exec.listActive('task_exec_01')).toHaveLength(1);
    expect(exec.claim('task_exec_01', 1, 'o2').created).toBe(false);

    exec.resumeFromPark(execution.execution_id, 'o2');
    const resumed = exec.get(execution.execution_id)!;
    expect(resumed.status).toBe('queued');
    expect(resumed.attempt).toBe(2);
    expect(resumed.lease_owner).toBe('o2');
    exec.markRunning(execution.execution_id, 'o2', 60_000);
    expect(exec.get(execution.execution_id)!.status).toBe('running');
    store.close();
  });

  it('setStatus refuses to enter awaiting_confirmation (park is the only entry)', () => {
    const { store, exec } = fresh();
    const { execution } = exec.claim('task_exec_01', 1, 'o');
    expect(() => exec.setStatus(execution.execution_id, 'awaiting_confirmation')).toThrow(/park/);
    expect(exec.get(execution.execution_id)!.status).toBe('queued');
    store.close();
  });
});
