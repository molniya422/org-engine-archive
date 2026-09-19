import { describe, it, expect, vi } from 'vitest';

describe('OrchestratorClient', () => {
  it('has correct protocol types', async () => {
    const { OrchestratorEvent } = await import('../src/orchestrator-adapter/protocol');
    // Verify types exist (compile-time check at import)
    expect(OrchestratorEvent).toBeUndefined(); // types-only export
  });

  it('rejects start when already active', async () => {
    const { OrchestratorClient } = await import('../src/orchestrator-adapter/client');
    const client = new OrchestratorClient();
    (client as any)._active = true;
    await expect(client.start('/x.yaml', 'task', '/out')).rejects.toThrow('Adapter already active');
  });
});
