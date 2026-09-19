import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';

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
});
