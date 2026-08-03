import { describe, it, expect } from 'vitest';
import { migrateOrg } from '../src/migrate-org';

const v1 = {
  version: '1.0',
  org: {
    name: 't',
    departments: [
      {
        name: 'Arch',
        roles: [{ name: 'architect', agentType: 'x', bound_skill: 'design-patterns' }],
        manager_pipeline: [{ name: 'decompose', agentType: 'x', bound_skill: 'pathfinder' }],
      },
    ],
    contracts: [{ key: 'api', owner_dept: 'Arch', version: 1, schema: {} }],
  },
  budget: {},
};

describe('migrateOrg', () => {
  it('assigns role ids and drops structural fields', () => {
    const v2 = migrateOrg(v1) as any;
    expect(v2.version).toBe('2.0');
    expect(v2.org.departments[0].roles[0].id).toBe('arch.architect');
    expect(v2.org.departments[0].manager_pipeline).toBeUndefined();
    expect(v2.org.contracts).toBeUndefined();
    expect(v2.org.departments[0].roles[0].bound_skills).toEqual(['design-patterns']);
  });

  it('captures v1 structural fields into _migrated metadata', () => {
    const v2 = migrateOrg(v1) as any;
    expect(v2._migrated.from).toBe('1.0');
    expect(v2._migrated.manager_pipeline).toEqual([
      { dept: 'Arch', name: 'decompose', agentType: 'x', bound_skill: 'pathfinder' },
    ]);
    expect(v2._migrated.contracts).toEqual([{ key: 'api', owner_dept: 'Arch', version: 1, schema: {} }]);
  });

  it('maps verdict_format to persona.output_format and permissions', () => {
    const v1b = {
      version: '1.0',
      org: {
        name: 't',
        departments: [
          {
            name: 'QA',
            roles: [
              { name: 'reviewer', agentType: 'x', bound_skill: 'pr-review', can_veto: true, can_escalate: true, verdict_format: 'json' },
            ],
          },
        ],
      },
      budget: {},
    };
    const v2 = migrateOrg(v1b) as any;
    const role = v2.org.departments[0].roles[0];
    expect(role.persona.output_format).toBe('json');
    expect(role.permissions).toEqual({ can_veto: true, can_escalate: true });
  });

  it('is idempotent for existing v2 configs', () => {
    const v2 = migrateOrg(v1) as any;
    expect(migrateOrg(v2)).toBe(v2);
  });
});
