import { describe, it, expect } from 'vitest';
import { createBindingResolver, ResolvedAgent } from '../src/binding-resolver';

const org = {
  org: {
    departments: [
      {
        name: 'Arch',
        roles: [
          {
            id: 'arch.architect',
            name: 'architect',
            agentType: 'general-purpose',
            bound_skills: ['design-patterns'],
            persona: { title: '首席架构师', backstory: '跨部门技术决策', output_format: 'verdict' },
            permissions: { can_veto: true, can_escalate: true },
          },
          {
            id: 'arch.integrator',
            name: 'integrator',
            agentType: 'general-purpose',
            bound_skills: ['pathfinder'],
          },
        ],
      },
      {
        name: 'FE',
        roles: [
          {
            id: 'fe.page_builder',
            name: 'page_builder',
            agentType: 'general-purpose',
            bound_skills: ['taste-skill'],
          },
        ],
      },
    ],
  },
};

const resolver = createBindingResolver(org);

describe('binding-resolver', () => {
  it('resolves role_ref to role identity', () => {
    const r = resolver.resolve('arch.architect');
    expect(r).not.toBeNull();
    expect(r!.id).toBe('arch.architect');
    expect(r!.name).toBe('architect');
    expect(r!.boundSkills).toEqual(['design-patterns']);
    expect(r!.agentType).toBe('general-purpose');
  });

  it('merges override onto resolved role (title promotion)', () => {
    const agent = resolver.resolveWithOverride('arch.architect', { goal: '本次目标' });
    expect(agent).not.toBeNull();
    expect((agent as ResolvedAgent).title).toBe('首席架构师');
    expect((agent as ResolvedAgent).goal).toBe('本次目标');
    expect((agent as ResolvedAgent).boundSkills).toEqual(['design-patterns']);
  });

  it('returns null for unknown role_ref', () => {
    expect(resolver.resolve('missing.role')).toBeNull();
    expect(resolver.resolveWithOverride('missing.role')).toBeNull();
  });

  it('resolves second role in same dept', () => {
    const r = resolver.resolve('arch.integrator');
    expect(r).not.toBeNull();
    expect(r!.boundSkills).toEqual(['pathfinder']);
  });

  it('resolves across departments', () => {
    const r = resolver.resolve('fe.page_builder');
    expect(r).not.toBeNull();
    expect(r!.id).toBe('fe.page_builder');
    expect(r!.boundSkills).toEqual(['taste-skill']);
  });
});
