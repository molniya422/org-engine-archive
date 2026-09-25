import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { classifyProposal, canAutoApply, AUTO_APPLY_LEVEL, AutoApplyPolicy, DEFAULT_MAX_AUTO_PER_WINDOW } from '../src/learning/autonomy';

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
let policyDir = '';
describe('AutoApplyPolicy (budget + circuit breaker)', () => {
  beforeEach(() => {
    policyDir = join(process.cwd(), '.tmp-policy', Math.random().toString(36).slice(2));
    mkdirSync(policyDir, { recursive: true });
  });
  afterEach(() => {
    if (policyDir) rmSync(policyDir, { recursive: true, force: true });
  });

  it('allows when fresh (no state file)', () => {
    expect(new AutoApplyPolicy(policyDir).allow()).toBe(true);
  });

  it('trips the breaker after max auto-applies', () => {
    const p = new AutoApplyPolicy(policyDir);
    for (let i = 0; i < DEFAULT_MAX_AUTO_PER_WINDOW; i++) p.record();
    expect(p.allow()).toBe(false);
  });

  it('fail-closed on corrupt state file', () => {
    writeFileSync(join(policyDir, 'autonomy-state.json'), '{broken', 'utf-8');
    expect(new AutoApplyPolicy(policyDir).allow()).toBe(false);
  });

  it('records and persists the increment', () => {
    new AutoApplyPolicy(policyDir).record();
    expect(new AutoApplyPolicy(policyDir).allow()).toBe(true);   // 1/3
    new AutoApplyPolicy(policyDir).record();
    expect(new AutoApplyPolicy(policyDir).allow()).toBe(true);   // 2/3
  });
});
