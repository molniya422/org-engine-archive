import { useEffect, useState } from 'react';
import { useInsightsStore } from '@/stores/insights-store';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { KeyRound, RefreshCw } from 'lucide-react';

interface ProductRecord {
  kind?: string; // allow | deny
  role?: string;
  key?: string;
  audit_status?: string; // pending | approved | rejected
  audit_reason?: string;
  skill_used?: string | null;
  evidence?: string | null;
  ts?: string;
}

function gateStatus(r: ProductRecord): { label: string; variant: 'success' | 'warning' | 'destructive' | 'outline' } {
  if (r.kind === 'allow' || r.audit_status === 'approved') return { label: 'passed', variant: 'success' };
  if (r.kind === 'deny' || r.audit_status === 'rejected') return { label: 'blocked', variant: 'destructive' };
  return { label: 'gated', variant: 'warning' };
}

function formatTs(ts: string | undefined): string {
  if (!ts) return '—';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

/** 产物密钥注册表：谁签发了什么产物、审计门状态与 skill 凭证（来自引擎 products.jsonl）。 */
export function ProductRegistryView() {
  const { products, loading, error, fetch } = useInsightsStore();
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetch();
  }, [fetch]);

  const refresh = async () => {
    setRefreshing(true);
    await fetch();
    setRefreshing(false);
  };

  const rows = [...(products as ProductRecord[])].sort((a, b) =>
    (b.ts ?? '').localeCompare(a.ts ?? ''),
  );

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <KeyRound size={20} className="text-accent" /> 产物注册表
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            产物 key 的签发与审计门状态（来自引擎 products.jsonl）
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={refresh} disabled={loading || refreshing}>
          <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} /> 刷新
        </Button>
      </header>

      {error && (
        <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm">{error}</div>
      )}

      {loading && rows.length === 0 ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <KeyRound size={32} className="mx-auto mb-3 text-muted-foreground/40" />
          <p className="text-lg mb-2">暂无产物记录</p>
          <p className="text-sm">运行包含产物签发的工作流后，key 注册会出现在这里。</p>
        </div>
      ) : (
        <div className="rounded-sm border border-border overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-3 py-2 font-mono text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground">角色</th>
                <th className="px-3 py-2 font-mono text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground">产物 key</th>
                <th className="px-3 py-2 font-mono text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground">审计门状态</th>
                <th className="px-3 py-2 font-mono text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground">skill manifest</th>
                <th className="px-3 py-2 font-mono text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground">时间</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const gate = gateStatus(r);
                return (
                  <tr key={i} className="border-b border-border/60 last:border-0 hover:bg-muted/20">
                    <td className="px-3 py-2 font-mono text-[12px] text-accent">{r.role ?? '—'}</td>
                    <td className="px-3 py-2 font-mono text-[12px]">{r.key ?? '—'}</td>
                    <td className="px-3 py-2">
                      <Badge variant={gate.variant}>{gate.label}</Badge>
                      {r.audit_reason && (
                        <span className="ml-2 text-[10px] text-muted-foreground" title={r.audit_reason}>
                          {r.audit_reason.slice(0, 24)}{r.audit_reason.length > 24 ? '…' : ''}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {r.skill_used ? (
                        <div className="text-[11px]">
                          <span className="font-mono text-accent">{r.skill_used}</span>
                          {r.evidence && (
                            <span className="block text-[10px] text-muted-foreground truncate max-w-[220px]">
                              {r.evidence}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-[11px] text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 font-mono text-[11px] text-muted-foreground">{formatTs(r.ts)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
