import { useEffect, useMemo, useState } from 'react';
import { api } from '@/api/client';
import { useOrgStore } from '@/stores/org-store';
import { collectWorkflowRefs, findBrokenRefs, detectFlowCycles } from '@/lib/binding-check';

interface CycleInfo {
  wf: string;
  nodes: string[];
}

/**
 * 强绑定校验面板：org 角色 ↔ workflow role_ref 的引用完整性。
 * 自包含：内部从 useOrgStore 读当前 org，加载 workflow 配置并计算
 *  绿 ✓ 角色被哪些 workflow 引用 / 红 ✗ 断引用 / 红 ⚠ flow 环。
 */
export function BindingCheckPanel() {
  const currentOrg = useOrgStore((s) => s.currentOrg);
  const [workflows, setWorkflows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        // listWorkflows 返回 string[]（仅 id），需逐个取完整文档才有 nodes
        const ids = (await api.listWorkflows()) ?? [];
        const docs = await Promise.all(ids.map((id) => api.getWorkflow(id)));
        setWorkflows(docs.filter(Boolean));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const report = useMemo(() => {
    const refs = collectWorkflowRefs(workflows);
    const broken = findBrokenRefs(currentOrg, workflows);
    const cycles: CycleInfo[] = workflows.flatMap((wf) =>
      detectFlowCycles(wf?.edges ?? []).map((nodes) => ({
        wf: wf?.name ?? wf?.id ?? '?',
        nodes,
      })),
    );
    return { refs, broken, cycles };
  }, [workflows, currentOrg]);

  const roleIds =
    currentOrg?.org?.departments?.flatMap((d: any) => d.roles ?? []).map((r: any) => r.id) ?? [];

  return (
    <div className="rounded-sm border border-border p-3 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground">
          强绑定校验
        </h4>
        {loading && <span className="text-[10px] text-muted-foreground">加载中…</span>}
      </div>

      {!loading && workflows.length === 0 && (
        <p className="text-[11px] text-muted-foreground">暂无 workflow 可校验</p>
      )}

      {!loading && roleIds.length > 0 && (
        <div className="space-y-1">
          {roleIds.map((rid: string) => {
            const usedBy = report.refs.get(rid) ?? [];
            return (
              <div key={rid} className="flex items-center gap-2 text-[11px]">
                <span className={usedBy.length ? 'text-emerald-400' : 'text-muted-foreground'}>✓</span>
                <span className="font-mono">{rid}</span>
                <span className="text-muted-foreground">
                  {usedBy.length ? `被 ${usedBy.join(', ')} 引用` : '未被引用'}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {report.broken.length > 0 && (
        <div className="space-y-1">
          {report.broken.map((b, i) => (
            <div key={i} className="flex items-center gap-2 text-[11px] text-destructive">
              <span>✗</span>
              <span className="font-mono">{b}</span>
            </div>
          ))}
        </div>
      )}

      {report.cycles.length > 0 && (
        <div className="space-y-1">
          {report.cycles.map((c, i) => (
            <div key={i} className="flex items-center gap-2 text-[11px] text-amber-400">
              <span>⚠</span>
              <span className="font-mono">
                {c.wf}: [{c.nodes.join(', ')}]
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
