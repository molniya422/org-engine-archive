import { describe, it, expect } from 'vitest';
import { WorkflowConfigStore } from '../src/workflow-config/store';

describe('workflow-config', () => {
  it('validates a workflow with an unknown role_ref', () => {
    const store = new WorkflowConfigStore();
    const wf = {
      version: '2.0',
      name: 'wf1',
      nodes: [{ id: 'n1', type: 'agent', role_ref: 'nonexistent.role' }],
      edges: [],
    };
    const r = store.validate(wf);
    expect(r.valid).toBe(false);
  });

  it('validates a workflow with an unknown acl ref', () => {
    const store = new WorkflowConfigStore();
    const wf = {
      version: '2.0',
      name: 'wf1',
      nodes: [
        {
          id: 'n1',
          type: 'channel',
          channel: { key: 'chan', acl: { read: ['nonexistent.role'], write: ['nonexistent.role'] } },
        },
      ],
      edges: [],
    };
    const r = store.validate(wf);
    expect(r.valid).toBe(false);
  });
});
