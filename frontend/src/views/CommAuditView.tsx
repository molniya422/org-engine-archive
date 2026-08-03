import { useEffect, useState } from 'react';
import { useInsightsStore } from '@/stores/insights-store';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Radar, RefreshCw } from 'lucide-react';

const VERDICT_LABEL: Record<string, string> = {
  allow: '允许',
  reject_cross_dept: '跨部门拦截',
  reject_upward: '越级拦截',
  reject_unknown: '未知拦截',
};

function verdictVariant(verdict: string): 'success' | 'warning' | 'destructive' | 'outline' {
  if (verdict === 'allow') return 'success';
  if (verdict === 'reject_cross_dept' || verdict === 'reject_upward') return 'warning';
  if (verdict?.startsWith('reject')) return 'destructive';
  return 'outline';
}

function formatTs(ts: string | undefined): string {
  if (!ts) return '—';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(d);
}

interface CommRecord {
  from?: string;
  to?: string;
  from_dept?: string;
  channel?: string | null;
  verdict?: string;
  reason?: string;
  ts?: string;
}

/** 通信审计视图：智能体间消息的通信与隔离判定（来自引擎 comm.jsonl）。 */
export function CommAuditView() {
  const { comm, loading, error, fetch } = useInsightsStore();
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetch();
  }, [fetch]);

  const refresh = async () => {
    setRefreshing(true);
    await fetch();
    setRefreshing(false);
  };

  const sorted = [...(comm as CommRecord[])].sort((a, b) =>
    (b.ts ?? '').localeCompare(a.ts ?? ''),
  );

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Radar size={20} className="text-accent" /> 通信审计
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            智能体间消息的通信与隔离判定（来自引擎 comm.jsonl）
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={refresh} disabled={loading || refreshing}>
          <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} /> 刷新
        </Button>
      </header>

      {error && (
        <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm">{error}</div>
      )}

      {loading && sorted.length === 0 ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-5 w-48" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-4 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : sorted.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Radar size={32} className="mx-auto mb-3 text-muted-foreground/40" />
          <p className="text-lg mb-2">暂无通信记录</p>
          <p className="text-sm">运行包含消息边或共享频道的工作流后，通信判定会出现在这里。</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sorted.map((r, i) => (
            <Card key={i}>
              <CardHeader>
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <CardTitle className="text-sm flex items-center gap-2 font-mono">
                    <span className="text-accent">{r.from ?? '—'}</span>
                    <span className="text-muted-foreground">→</span>
                    <span className="text-foreground">{r.to ?? '—'}</span>
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <Badge variant={verdictVariant(r.verdict ?? '')}>
                      {r.verdict ? (VERDICT_LABEL[r.verdict] ?? r.verdict) : '—'}
                    </Badge>
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {formatTs(r.ts)}
                    </span>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-center justify-between gap-4">
                  <CardDescription className="text-xs shrink-0">来源部门</CardDescription>
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {r.from_dept ?? '—'}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <CardDescription className="text-xs shrink-0">频道</CardDescription>
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {r.channel ?? '（无显式频道）'}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <CardDescription className="text-xs shrink-0">判定原因</CardDescription>
                  <span className="text-[11px] text-muted-foreground text-right">{r.reason ?? '—'}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
