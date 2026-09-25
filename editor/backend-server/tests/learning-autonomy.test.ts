import { describe, it, expect } from 'vitest';
import { classifyProposal, canAutoApply, AUTO_APPLY_LEVEL } from '../src/learning/autonomy';

describe('autonomy risk classification', () => {
  it('rebind_skill is low risk', () => {
    expect(classifyProposal({ changes: [{ op: 'rebind_skill', skill: 'x', target: 'y' }] })).toBe('low');
  });
  it('add_role is high risk', () => {
    expect(classifyProposal({ changes: [{ op: 'add_role', dept: 'QA', role: {} }] })).toBe('high');
  });
  it('unbind_skill is high risk', () => {
    expect(classifyProposal({ changes: [{ op: 'unbind_skill', skill: 'x' }] })).toBe('high');
  });
  it('bump_contract is high risk', () => {
    expect(classifyProposal({ changes: [{ op: 'bump_contract', contract: 'ui' }] })).toBe('high');
  });
  it('mixed changes are high risk', () => {
    expect(classifyProposal({ changes: [
      { op: 'rebind_skill', skill: 'x', target: 'y' },
      { op: 'add_role', dept: 'QA', role: {} },
    ] })).toBe('high');
  });
  it('empty changes are never auto-applied', () => {
    expect(classifyProposal({ changes: [] })).toBe('high');
  });
  it('canAutoApply only at the auto level', () => {
    const low = { changes: [{ op: 'rebind_skill', skill: 'x', target: 'y' }] };
    expect(canAutoApply(low, 'l1')).toBe(false);
    expect(canAutoApply(low, 'l2')).toBe(false);
    expect(canAutoApply(low, AUTO_APPLY_LEVEL)).toBe(true);
    const high = { changes: [{ op: 'add_role', dept: 'QA', role: {} }] };
    expect(canAutoApply(high, AUTO_APPLY_LEVEL)).toBe(false);
  });
});