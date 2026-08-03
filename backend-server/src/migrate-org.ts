// migrate-org.ts
// 把 org-config v1.0（含 manager_pipeline/contracts）迁移到 v2.0（纯角色注册表）。
// v1 的结构字段不丢：manager_pipeline / contracts 记录到 _migrated 元数据，
// 由 workflow 侧按需转为 workflow 节点/频道（见设计文档 §6）。

import { parse, stringify } from 'yaml';
import { readFileSync, writeFileSync } from 'node:fs';

export function migrateOrg(v1: unknown): unknown {
  const src = v1 as any;
  if (src?.version === '2.0') return src;

  const v1Org = src?.org ?? {};
  const departments = (v1Org.departments ?? []).map((d: any) => {
    const roles = (d.roles ?? []).map((r: any) => {
      // id 生成规则：dept 名小写 + 角色名（对齐 schema 的 ^[a-z][a-z0-9]*\.[a-z][a-z0-9_]*$）
      const id = r.id ?? `${String(d.name).toLowerCase()}.${r.name}`;
      const { bound_skill, can_veto, can_escalate, verdict_format, ...rest } = r;
      return {
        id,
        ...rest,
        bound_skills: [bound_skill].filter(Boolean),
        persona: {
          title: r.name,
          ...(verdict_format ? { output_format: verdict_format } : {}),
        },
        permissions: { can_veto: !!can_veto, can_escalate: !!can_escalate },
      };
    });
    const { manager_pipeline, ...deptRest } = d;
    return { ...deptRest, roles };
  });

  // 显式剥掉 contracts，避免 spread 把它带入 v2（v2 无此字段）
  const { contracts, ...orgRest } = v1Org;

  return {
    version: '2.0',
    org: { ...orgRest, departments },
    budget: src?.budget ?? {},
    skill_paths: src?.skill_paths ?? [],
    _migrated: {
      from: '1.0',
      manager_pipeline: (v1Org.departments ?? []).flatMap((d: any) =>
        (d.manager_pipeline ?? []).map((s: any) => ({ dept: d.name, ...s })),
      ),
      contracts: contracts ?? [],
    },
  };
}

// CLI: node migrate-org.ts <input.yaml> <output.yaml>
if (typeof require !== 'undefined' && require.main === module) {
  const [, , input, output] = process.argv;
  if (!input || !output) {
    console.error('usage: migrate-org.ts <input.yaml> <output.yaml>');
    process.exit(1);
  }
  const migrated = migrateOrg(parse(readFileSync(input, 'utf-8')));
  writeFileSync(output, stringify(migrated, { indent: 2 }), 'utf-8');
  console.log(`migrated ${input} -> ${output}`);
}
