import { describe, it, expect } from 'vitest';
import {
  buildTaskEnvelope, bumpContractVersion, isEvidenceForContract,
  type TaskEnvelope, type ExecutionEvent,
} from '../src/personal/task-envelope';

const RAW = {
  contract_version: 1,
  policy_version: 'baseline-0.1',
  trace_id: 'trace_abc',
  task_id: 'task_1',
  intent_id: 'intent_1',
  conversation_id: 'conv_1',
  goal: '整理本月的报销单',
  redacted_state: { facts: [{ kind: 'preference', value: '月底前完成' }] },
  evidence_refs: ['ev_1', 'ev_2'],
  budget: { max_actions: 5 },
};

describe('P4.1 TaskEnvelope bridge (TS mirror)', () => {
  it('builds from a complete dict', () => {
    const env = buildTaskEnvelope(RAW);
    expect(env.trace_id).toBe('trace_abc');
    expect(env.evidence_refs).toEqual(['ev_1', 'ev_2']);
  });

  it('rejects missing required fields (fail-closed)', () => {
    const { trace_id, ...withoutTrace } = RAW;
    expect(() => buildTaskEnvelope(withoutTrace as never)).toThrow(/trace_id/);
  });

  it('condition change bumps contract version', () => {
    expect(bumpContractVersion(1)).toBe(2);
  });

  it('historical events from other contract versions are not completion evidence', () => {
    const oldEvent: ExecutionEvent = {
      trace_id: 'trace_old', task_id: 'task_1', seq: 3,
      event_type: 'action_completed', payload: { contract_version: 1 },
    };
    expect(isEvidenceForContract(oldEvent, 2)).toBe(false);
    expect(isEvidenceForContract(oldEvent, 1)).toBe(true);
  });

  it('envelope carries only redacted state (no raw sensitive params)', () => {
    const env: TaskEnvelope = buildTaskEnvelope(RAW);
    expect(JSON.stringify(env)).not.toContain('salary');
  });
});
