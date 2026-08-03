// binding-resolver.ts
// 把 workflow 的 role_ref 解析回 org 角色身份（强绑定的核心）。
// org 是角色身份的唯一真源；workflow 节点只存 role_ref，运行时经此解析。

export interface RoleIdentity {
  id: string;
  name: string;
  agentType: string;
  boundSkills: string[];
  persona?: { title?: string; backstory?: string; output_format?: string };
  permissions?: { can_veto?: boolean; can_escalate?: boolean };
}

export interface ResolvedAgent extends RoleIdentity {
  title?: string;      // 从 persona.title 提升，供运行时直接使用
  goal?: string;
}

export interface BindingResolver {
  /** 按角色 id 解析身份；未知 id 返回 null（断引用）。 */
  resolve(id: string): RoleIdentity | null;
  /** 解析身份并合并执行期 override（如 goal）；未知 id 返回 null。 */
  resolveWithOverride(id: string, override?: Record<string, unknown>): ResolvedAgent | null;
  /** 供强绑定校验面板使用：返回每个被引用的角色 id 及其 workflow 列表。 */
  references(): { roleId: string; workflows: string[] }[];
}

export function createBindingResolver(orgConfig: unknown): BindingResolver {
  const byId = new Map<string, RoleIdentity & { dept: string }>();
  const org = (orgConfig as any)?.org;
  for (const d of org?.departments ?? []) {
    for (const r of d?.roles ?? []) {
      if (r?.id) {
        byId.set(r.id, {
          id: r.id,
          name: r.name,
          agentType: r.agentType,
          boundSkills: r.bound_skills ?? [],
          persona: r.persona,
          permissions: r.permissions,
          dept: d.name,
        });
      }
    }
  }

  return {
    resolve(id) {
      const r = byId.get(id);
      if (!r) return null;
      const { dept, ...identity } = r;
      return identity;
    },
    resolveWithOverride(id, override) {
      const r = byId.get(id);
      if (!r) return null;
      const { dept, ...identity } = r;
      return {
        ...identity,
        title: r.persona?.title,
        goal: (override?.goal as string | undefined) ?? r.persona?.title,
        ...(override ?? {}),
      };
    },
    references() {
      return []; // 由 workflow 仓库注入（见 P4 Task 4.4 强绑定校验面板）
    },
  };
}
