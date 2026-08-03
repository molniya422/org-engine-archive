import { describe, it, expect } from 'vitest';
import { migrateOrg } from '../src/migrate-org';
import { createBindingResolver } from '../src/binding-resolver';
import { WorkflowValidator } from '../src/workflow-config/validator';

// 闭环 e2e：v1 org → v2（迁移/剥离/元数据）→ role_ref 绑定解析 → workflow 校验
describe('e2e: v1 org -> v2 + binding + workflow validate', () => {
  const v1 = {
    version: '1.0',
    org: {
      name: 't',
      departments: [
        {
          name: 'FE',
          roles: [
            { name: 'fe_page_builder', agentType: 'x', bound_skill: 'taste-skill' },
            { name: 'page_reviewer', agentType: 'x', bound_skill: 'review-skill', can_veto: true },
          ],
        },
        {
          name: 'Manager',
          manager_pipeline: [{ name: 'decompose', agentType: 'm', bound_skill: 'mgr-skill' }],
        },
      ],
      contracts: [{ key: 'c1', owner_dept: 'FE', version: 1, schema: {} }],
    },
    budget: {},
  };

  it('migrates v1 -> v2: id/bound_skills/persona/permissions, drops contracts & pipeline', () => {
    const v2 = migrateOrg(v1) as any;

    expect(v2.version).toBe('2.0');

    // 结构字段剥离：contracts / manager_pipeline 不进 v2，记录到 _migrated
    expect(v2.org.contracts).toBeUndefined();
    expect(v2.org.departments.find((d: any) => d.name === 'Manager').manager_pipeline).toBeUndefined();
    expect(v2._migrated.contracts).toEqual([{ key: 'c1', owner_dept: 'FE', version: 1, schema: {} }]);
    expect(v2._migrated.manager_pipeline).toEqual([
      { dept: 'Manager', name: 'decompose', agentType: 'm', bound_skill: 'mgr-skill' },
    ]);

    // 角色规范化
    const feRoles = v2.org.departments.find((d: any) => d.name === 'FE').roles;
    const page = feRoles.find((r: any) => r.name === 'fe_page_builder');
    expect(page.id).toBe('fe.fe_page_builder');          // dept 小写 + 角色名（含下划线）
    expect(page.bound_skills).toEqual(['taste-skill']);  // v1 单值 → v2 数组
    expect(page.persona.title).toBe('fe_page_builder');
    expect(page.permissions.can_veto).toBe(false);

    const reviewer = feRoles.find((r: any) => r.name === 'page_reviewer');
    expect(reviewer.id).toBe('fe.page_reviewer');
    expect(reviewer.permissions.can_veto).toBe(true);
  });

  it('binding resolver returns camelCase boundSkills; unknown role_ref -> null', () => {
    const resolver = createBindingResolver(migrateOrg(v1));

    const resolved = resolver.resolve('fe.fe_page_builder');
    expect(resolved).not.toBeNull();
    expect(resolved!.boundSkills).toEqual(['taste-skill']);
    expect(resolved!.name).toBe('fe_page_builder');
    expect(resolver.resolve('fe.nope')).toBeNull();

    // resolveWithOverride 把 persona.title 提升为顶层 title，override 合并 goal
    const overridden = resolver.resolveWithOverride('fe.fe_page_builder', { goal: 'build UI' });
    expect((overridden as any).title).toBe('fe_page_builder');
    expect((overridden as any).goal).toBe('build UI');
  });

  it('workflow validator cross-checks role_ref against migrated org roles', () => {
    const v2 = migrateOrg(v1) as any;
    const roleIds = new Set(
      v2.org.departments.flatMap((d: any) => (d.roles ?? []).map((r: any) => r.id)),
    );
    const validator = new WorkflowValidator((ref: string) => roleIds.has(ref));

    const good = validator.validateRaw({
      version: '2.0',
      name: 'good-wf',
      nodes: [{ id: 'a', type: 'agent', role_ref: 'fe.fe_page_builder' }],
      edges: [],
    });
    expect(good.valid).toBe(true);

    const bad = validator.validateRaw({
      version: '2.0',
      name: 'bad-wf',
      nodes: [{ id: 'a', type: 'agent', role_ref: 'fe.nope' }],
      edges: [],
    });
    expect(bad.valid).toBe(false);
    expect(bad.errors[0].message).toContain('unknown role_ref: fe.nope');
  });
});
