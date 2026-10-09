import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import Fastify from 'fastify';
import { registerRunRoutes } from '../src/run.routes';
import type { RunManager } from '../src/run-manager/manager';

// ---------------------------------------------------------------------------
// RunPersistence tests — mock homedir so we never touch the real filesystem
// ---------------------------------------------------------------------------

const TEST_HOME = join(process.cwd(), '.test-run-persistence-home');

vi.mock('node:os', () => ({
  homedir: () => TEST_HOME,
}));

describe('RunPersistence', () => {
  let RunPersistence: Awaited<typeof import('../src/run-manager/persistence')>['RunPersistence'];
  let persistence: import('../src/run-manager/persistence')['RunPersistence'];

  beforeAll(async () => {
    await rm(TEST_HOME, { recursive: true, force: true });
    const mod = await import('../src/run-manager/persistence');
    RunPersistence = mod.RunPersistence;
    persistence = new RunPersistence();
  });

  afterAll(async () => {
    await rm(TEST_HOME, { recursive: true, force: true });
  });

  it('saves and loads run state', async () => {
    const state = {
      runId: 'test-run-1',
      status: 'running' as const,
      gateway: null,
      orgId: 'test-org',
      task: 'test task',
      events: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await persistence.save('test-run-1', state);
    const loaded = await persistence.load('test-run-1');
    expect(loaded).not.toBeNull();
    expect(loaded!.runId).toBe('test-run-1');
    expect(loaded!.status).toBe('running');
    expect(loaded!.orgId).toBe('test-org');
  });

  it('returns null for non-existent run', async () => {
    const loaded = await persistence.load('no-such-run');
    expect(loaded).toBeNull();
  });

  it('lists saved runs', async () => {
    const list = await persistence.list();
    expect(list).toContain('test-run-1');
  });
});

// ---------------------------------------------------------------------------
// RunManager tests — mock OrchestratorClient and RunPersistence
// ---------------------------------------------------------------------------

describe('RunManager', () => {
  let RunManager: Awaited<typeof import('../src/run-manager/manager')>['RunManager'];
  let mockClient: Record<string, any>;
  let mockPersistence: Record<string, any>;

  beforeEach(() => {
    mockClient = {
      on: vi.fn(),
      removeAllListeners: vi.fn(),
      start: vi.fn().mockResolvedValue(undefined),
      submitDecision: vi.fn().mockResolvedValue(undefined),
      cancel: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn(),
    };

    mockPersistence = {
      save: vi.fn().mockResolvedValue(undefined),
      load: vi.fn().mockResolvedValue(null),
      list: vi.fn().mockResolvedValue([]),
    };
  });

  it('transitions from running to done on run_completed event', async () => {
    const mod = await import('../src/run-manager/manager');
    RunManager = mod.RunManager;

    // Track registered event handlers
    const handlers: Record<string, Function> = {};
    mockClient.on.mockImplementation((event: string, handler: Function) => {
      handlers[event] = handler;
    });

    const manager = new RunManager(mockClient as any, mockPersistence as any);
    const runId = await manager.start('test-org', 'test task', '/config.yaml', '/out');

    expect(runId).toBeTruthy();
    expect(manager.current).not.toBeNull();
    expect(manager.current!.status).toBe('running');
    expect(manager.current!.orgId).toBe('test-org');
    expect(manager.current!.task).toBe('test task');
    expect(mockPersistence.save).toHaveBeenCalled();

    // Simulate a run_completed event from the orchestrator
    const eventHandler = handlers['event'];
    expect(eventHandler).toBeDefined();
    await eventHandler({ type: 'run_completed', status: 'success' });

    expect(manager.current!.status).toBe('done');
    expect(mockClient.stop).toHaveBeenCalled();
    expect(mockClient.removeAllListeners).toHaveBeenCalled();
  });

  it('handles cancel correctly', async () => {
    const mod = await import('../src/run-manager/manager');
    RunManager = mod.RunManager;

    mockClient.on.mockImplementation(() => {});
    const manager = new RunManager(mockClient as any, mockPersistence as any);
    await manager.start('test-org', 'test task', '/config.yaml', '/out');

    // Reset save count to simplify assertion
    mockPersistence.save.mockClear();

    await manager.cancel();

    expect(manager.current!.status).toBe('cancelled');
    expect(mockClient.cancel).toHaveBeenCalled();
    expect(mockPersistence.save).toHaveBeenCalled();
    expect(mockClient.stop).toHaveBeenCalled();
    expect(mockClient.removeAllListeners).toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // P0-A: block reason persistence, start guard, gateway timeout, onExit
  // -----------------------------------------------------------------------

  it('rejects a second start() while a run is active', async () => {
    const mod = await import('../src/run-manager/manager');
    RunManager = mod.RunManager;

    mockClient.on.mockImplementation(() => {});
    const manager = new RunManager(mockClient as any, mockPersistence as any);
    await manager.start('test-org', 'task 1', '/config.yaml', '/out');

    await expect(manager.start('test-org', 'task 2', '/config.yaml', '/out'))
      .rejects.toThrow(/Run already active/);

    // First run is still intact
    expect(manager.current!.status).toBe('running');
  });

  it('allows start() after the previous run is done', async () => {
    const mod = await import('../src/run-manager/manager');
    RunManager = mod.RunManager;

    const handlers: Record<string, Function> = {};
    mockClient.on.mockImplementation((event: string, handler: Function) => { handlers[event] = handler; });
    const manager = new RunManager(mockClient as any, mockPersistence as any);
    await manager.start('test-org', 'task 1', '/config.yaml', '/out');

    // Complete the first run
    await handlers['event']({ type: 'run_completed', status: 'success' });

    // Now a new start should succeed
    const runId2 = await manager.start('test-org', 'task 2', '/config.yaml', '/out');
    expect(runId2).toBeTruthy();
    expect(manager.current!.status).toBe('running');
  });

  it('auto-blocks with reason on gateway timeout (fake timers)', async () => {
    const mod = await import('../src/run-manager/manager');
    RunManager = mod.RunManager;

    vi.useFakeTimers();

    const handlers: Record<string, Function> = {};
    mockClient.on.mockImplementation((event: string, handler: Function) => { handlers[event] = handler; });
    const manager = new RunManager(mockClient as any, mockPersistence as any, 100);
    await manager.start('test-org', 'test task', '/config.yaml', '/out');

    // Simulate a gateway prompt — should start the timeout timer
    await handlers['event']({ type: 'gateway_prompt', gateway: 'approval', context: {}, question: 'Approve?' });
    expect(manager.current!.status).toBe('awaiting_user');

    // Fast-forward past the timeout
    vi.advanceTimersByTime(150);
    // Flush microtasks from the async block() call
    await Promise.resolve();
    await Promise.resolve();

    expect(manager.current!.status).toBe('blocked');
    expect(manager.current!.blockReason).toBe('等待用户确认超时');

    vi.useRealTimers();
  });

  it('does not timeout after the user submits a decision', async () => {
    const mod = await import('../src/run-manager/manager');
    RunManager = mod.RunManager;

    vi.useFakeTimers();

    const handlers: Record<string, Function> = {};
    mockClient.on.mockImplementation((event: string, handler: Function) => { handlers[event] = handler; });
    mockClient.submitDecision.mockResolvedValue(undefined);
    const manager = new RunManager(mockClient as any, mockPersistence as any, 100);
    await manager.start('test-org', 'test task', '/config.yaml', '/out');

    await handlers['event']({ type: 'gateway_prompt', gateway: 'approval', context: {}, question: 'Approve?' });
    expect(manager.current!.status).toBe('awaiting_user');

    // User submits decision before the timeout
    await manager.submitDecision('approval', { ok: true });

    // Fast-forward past the timeout — should NOT have blocked
    vi.advanceTimersByTime(200);
    expect(manager.current!.status).toBe('running');

    vi.useRealTimers();
  });

  it('persists blockReason so it can be loaded later', async () => {
    const mod = await import('../src/run-manager/manager');
    RunManager = mod.RunManager;

    const handlers: Record<string, Function> = {};
    mockClient.on.mockImplementation((event: string, handler: Function) => { handlers[event] = handler; });

    // Capture the last saved state so we can "load" it back
    let savedState: any = null;
    mockPersistence.save.mockImplementation(async (_id: string, state: any) => { savedState = state; });
    mockPersistence.load.mockImplementation(async () => savedState);

    const manager = new RunManager(mockClient as any, mockPersistence as any);
    await manager.start('test-org', 'test task', '/config.yaml', '/out');

    // Trigger a block via process exit
    await handlers['exit'](1);

    expect(manager.current!.status).toBe('blocked');
    expect(manager.current!.blockReason).toContain('Process exited');

    // Verify the persisted state has blockReason
    const loaded = await mockPersistence.load('whatever');
    expect(loaded).not.toBeNull();
    expect(loaded.blockReason).toContain('Process exited');
  });

  it('blocks with reason when process exits during awaiting_user', async () => {
    const mod = await import('../src/run-manager/manager');
    RunManager = mod.RunManager;

    const handlers: Record<string, Function> = {};
    mockClient.on.mockImplementation((event: string, handler: Function) => { handlers[event] = handler; });

    const manager = new RunManager(mockClient as any, mockPersistence as any, 999999);
    await manager.start('test-org', 'test task', '/config.yaml', '/out');

    // Transition to awaiting_user
    await handlers['event']({ type: 'gateway_prompt', gateway: 'approval', context: {}, question: 'Approve?' });
    expect(manager.current!.status).toBe('awaiting_user');

    // Process exits while awaiting_user
    await handlers['exit'](null);

    expect(manager.current!.status).toBe('blocked');
    expect(manager.current!.blockReason).toContain('waiting for user decision');
  });

  it('does not block when process exits after run is done', async () => {
    const mod = await import('../src/run-manager/manager');
    RunManager = mod.RunManager;

    const handlers: Record<string, Function> = {};
    mockClient.on.mockImplementation((event: string, handler: Function) => { handlers[event] = handler; });

    const manager = new RunManager(mockClient as any, mockPersistence as any);
    await manager.start('test-org', 'test task', '/config.yaml', '/out');

    // Complete the run
    await handlers['event']({ type: 'run_completed', status: 'success' });
    expect(manager.current!.status).toBe('done');

    // Process exits after completion — should NOT transition to blocked
    await handlers['exit'](0);
    expect(manager.current!.status).toBe('done');
  });
});

// ---------------------------------------------------------------------------
// Route-level tests — org_id validation, persistence fallback, list reuse
// ---------------------------------------------------------------------------

describe('Run routes', () => {
  function buildApp(runManager: any, persistence?: any) {
    const app = Fastify({ logger: false });
    registerRunRoutes(app, runManager, persistence);
    return app;
  }

  async function inject(app: any, method: string, path: string, body?: any) {
    const opts: any = { method, url: path };
    if (body !== undefined) { opts.headers = { 'content-type': 'application/json' }; opts.payload = JSON.stringify(body); }
    const res = await app.inject(opts);
    return { status: res.statusCode, body: res.json() };
  }

  it('rejects org_id containing path traversal with 400', async () => {
    const mockClient = { on: vi.fn(), stop: vi.fn(), removeAllListeners: vi.fn(), start: vi.fn().mockResolvedValue(undefined), submitDecision: vi.fn(), cancel: vi.fn() };
    const mockPersistence = { save: vi.fn(), load: vi.fn().mockResolvedValue(null), list: vi.fn().mockResolvedValue([]) };
    const mod = await import('../src/run-manager/manager');
    const manager = new mod.RunManager(mockClient as any, mockPersistence as any);

    const app = buildApp(manager, mockPersistence);
    const res = await inject(app, 'POST', '/api/v1/runs', { org_id: '../etc', task: 'hack' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid/i);
  });

  it('rejects org_id containing backslash with 400', async () => {
    const mockClient = { on: vi.fn(), stop: vi.fn(), removeAllListeners: vi.fn(), start: vi.fn().mockResolvedValue(undefined), submitDecision: vi.fn(), cancel: vi.fn() };
    const mockPersistence = { save: vi.fn(), load: vi.fn().mockResolvedValue(null), list: vi.fn().mockResolvedValue([]) };
    const mod = await import('../src/run-manager/manager');
    const manager = new mod.RunManager(mockClient as any, mockPersistence as any);

    const app = buildApp(manager, mockPersistence);
    const res = await inject(app, 'POST', '/api/v1/runs', { org_id: 'org\\evil', task: 'hack' });
    expect(res.status).toBe(400);
  });

  it('GET /runs/:id returns persisted state for historical run (not 404)', async () => {
    const mockClient = { on: vi.fn(), stop: vi.fn(), removeAllListeners: vi.fn(), start: vi.fn().mockResolvedValue(undefined), submitDecision: vi.fn(), cancel: vi.fn() };
    const historicalState = {
      runId: 'run_old_123', status: 'done', gateway: null, orgId: 'test-org',
      task: 'old task', events: [], createdAt: '2025-01-01T00:00:00Z', updatedAt: '2025-01-01T01:00:00Z',
    };
    const mockPersistence = {
      save: vi.fn(),
      load: vi.fn().mockImplementation(async (id: string) => id === 'run_old_123' ? historicalState : null),
      list: vi.fn().mockResolvedValue(['run_old_123']),
    };
    const mod = await import('../src/run-manager/manager');
    const manager = new mod.RunManager(mockClient as any, mockPersistence as any);

    const app = buildApp(manager, mockPersistence);
    const res = await inject(app, 'GET', '/api/v1/runs/run_old_123');
    expect(res.status).toBe(200);
    expect(res.body.runId).toBe('run_old_123');
    expect(res.body.status).toBe('done');
    expect(res.body.task).toBe('old task');
  });

  it('GET /runs/:id returns 404 for unknown run', async () => {
    const mockClient = { on: vi.fn(), stop: vi.fn(), removeAllListeners: vi.fn(), start: vi.fn(), submitDecision: vi.fn(), cancel: vi.fn() };
    const mockPersistence = { save: vi.fn(), load: vi.fn().mockResolvedValue(null), list: vi.fn().mockResolvedValue([]) };
    const mod = await import('../src/run-manager/manager');
    const manager = new mod.RunManager(mockClient as any, mockPersistence as any);

    const app = buildApp(manager, mockPersistence);
    const res = await inject(app, 'GET', '/api/v1/runs/no_such_run');
    expect(res.status).toBe(404);
  });

  it('GET /runs?org_id=... reuses persistence.list + load', async () => {
    const states = [
      { runId: 'r1', status: 'done', orgId: 'myorg', task: 't1', events: [], createdAt: '2025-03-01T00:00:00Z', updatedAt: '2025-03-01T01:00:00Z' },
      { runId: 'r2', status: 'blocked', orgId: 'myorg', task: 't2', events: [], createdAt: '2025-04-01T00:00:00Z', updatedAt: '2025-04-01T01:00:00Z', blockReason: 'crash' },
      { runId: 'r3', status: 'done', orgId: 'other', task: 't3', events: [], createdAt: '2025-05-01T00:00:00Z', updatedAt: '2025-05-01T01:00:00Z' },
    ];
    const mockClient = { on: vi.fn(), stop: vi.fn(), removeAllListeners: vi.fn(), start: vi.fn(), submitDecision: vi.fn(), cancel: vi.fn() };
    const mockPersistence = {
      save: vi.fn(),
      load: vi.fn().mockImplementation(async (id: string) => states.find(s => s.runId === id) ?? null),
      list: vi.fn().mockResolvedValue(states.map(s => s.runId)),
    };
    const mod = await import('../src/run-manager/manager');
    const manager = new mod.RunManager(mockClient as any, mockPersistence as any);

    const app = buildApp(manager, mockPersistence);
    const res = await inject(app, 'GET', '/api/v1/runs?org_id=myorg');
    expect(res.status).toBe(200);
    expect(res.body.runs).toHaveLength(2);
    // Should be sorted newest-first
    expect(res.body.runs[0].runId).toBe('r2');
    expect(res.body.runs[1].runId).toBe('r1');
    expect(mockPersistence.list).toHaveBeenCalled();
    expect(mockPersistence.load).toHaveBeenCalled();
  });
});
