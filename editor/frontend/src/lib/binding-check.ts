// 强绑定校验工具（前端）：org 角色 ↔ workflow role_ref 的引用完整性检查。
// 输入为后端 workflow-config 形状（蛇形 role_ref / name / edges[].kind），
// 与 schema.ts 的 WorkflowConfig 类型、validator.ts 的 role_ref 校验一致。

/** 统计每个 role_ref 被哪些 workflow 引用。 */
export function collectWorkflowRefs(workflows: any[]): Map<string, string[]> {
  const refs = new Map<string, string[]>();
  for (const wf of workflows) {
    for (const n of wf.nodes ?? []) {
      if (n.role_ref) refs.set(n.role_ref, [...(refs.get(n.role_ref) ?? []), wf.name ?? wf.id]);
    }
  }
  return refs;
}

/** 找出引用了 org 中不存在角色的节点：返回 `${workflow.name}:${node.id}->${role_ref}`。 */
export function findBrokenRefs(org: any, workflows: any[]): string[] {
  const roleIds = new Set(
    org?.org?.departments?.flatMap((d: any) => d.roles ?? []).map((r: any) => r.id) ?? [],
  );
  return workflows.flatMap((wf: any) =>
    (wf.nodes ?? [])
      .filter((n: any) => n.role_ref && !roleIds.has(n.role_ref))
      .map((n: any) => `${wf.name ?? wf.id}:${n.id}->${n.role_ref}`),
  );
}

// 循环依赖检测：对 workflow 的 flow 边做拓扑排序，未排尽的节点在环上
export function detectFlowCycles(
  edges: { source: string; target: string; kind?: string }[],
): string[][] {
  const flow = edges.filter((e) => e.kind !== 'message');
  const adj = new Map<string, string[]>();
  const indeg = new Map<string, number>();
  for (const e of flow) {
    if (!adj.has(e.source)) adj.set(e.source, []);
    adj.get(e.source)!.push(e.target);
    indeg.set(e.target, (indeg.get(e.target) ?? 0) + 1);
  }
  const queue: string[] = [];
  for (const n of adj.keys()) if (!indeg.has(n)) queue.push(n);
  while (queue.length) {
    const cur = queue.shift()!;
    for (const nx of adj.get(cur) ?? []) {
      indeg.set(nx, indeg.get(nx)! - 1);
      if (indeg.get(nx) === 0) queue.push(nx);
    }
  }
  // 仍剩 indeg>0 的节点都在某个环上
  const inCycle = [...indeg.entries()].filter(([, d]) => d > 0).map(([n]) => n);
  return inCycle.length ? [inCycle] : [];
}
