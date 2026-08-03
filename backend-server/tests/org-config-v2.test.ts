import { describe, it, expect } from 'vitest';
import { Validator } from '../src/org-config/validator';

function makeOrg(roles: any[]) {
  return { version: '2.0', org: { name: 't', departments: [{ name: 'Arch', roles }] }, budget: {} };
}

describe('org-config v2', () => {
  it('accepts a valid v2 org with unique role ids', () => {
    const v = new Validator();
    const r = v.validateRaw(makeOrg([
      { id: 'arch.architect', name: 'architect', agentType: 'general-purpose', bound_skills: ['design-patterns'] },
    ]));
    expect(r.valid).toBe(true);
  });

  it('rejects duplicate role ids', () => {
    const v = new Validator();
    const r = v.validateRaw(makeOrg([
      { id: 'arch.architect', name: 'a', agentType: 'x', bound_skills: ['s'] },
      { id: 'arch.architect', name: 'b', agentType: 'x', bound_skills: ['s'] },
    ]));
    expect(r.valid).toBe(false);
  });

  it('rejects duplicate role ids across different departments', () => {
    const v = new Validator();
    const r = v.validateRaw({
      version: '2.0',
      org: { name: 't', departments: [
        { name: 'Arch', roles: [{ id: 'arch.lead', name: 'a', agentType: 'x', bound_skills: ['s'] }] },
        { name: 'Ops',  roles: [{ id: 'arch.lead', name: 'b', agentType: 'x', bound_skills: ['s'] }] },
      ] },
      budget: {},
    });
    expect(r.valid).toBe(false);
  });
});
