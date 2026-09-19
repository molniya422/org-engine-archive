import { useEffect, useState } from 'react';
import { useInsightsStore } from '@/stores/insights-store';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { CalendarDays, RefreshCw } from 'lucide-react';
import { formatMeetingType } from '@/components/workflow/meeting-labels';

const DECISION_LABEL: Record<string, string> = {
  accept: '通过',
  revise: '修改',
  escalate: '升级',
};

function decisionVariant(decision: string): 'default' | 'muted' | 'outline' {
  if (decision === 'accept') return 'default';
  if (decision === 'escalate') return 'muted';
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

interface MeetingRecord {
  type?: string;
  cycle?: number;
  participants?: string[];
  decision?: string;
  ts?: string;
}

/** 会议时间线视图：引擎落盘 meetings.jsonl 的最新在前流转记录。 */
export function MeetingsView() {
  const { meetings, loading, error, fetch } = useInsightsStore();
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetch();
  }, [fetch]);

  const refresh = async () => {
    setRefreshing(true);
    await fetch();
    setRefreshing(false);
  };

  const sorted = [...(meetings as MeetingRecord[])].sort((a, b) =>
    (b.ts ?? '').localeCompare(a.ts ?? ''),
  );

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <CalendarDays size={20} className="text-accent" /> 会议记录
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            部门内 / 部长级 / 决策会议的时间线与流转结论（来自引擎 meetings.jsonl）
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
          <CalendarDays size={32} className="mx-auto mb-3 text-muted-foreground/40" />
          <p className="text-lg mb-2">暂无会议记录</p>
          <p className="text-sm">运行一次包含会议节点的工作流后，纪要会出现在这里。</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sorted.map((m, i) => (
            <Card key={i}>
              <CardHeader>
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Badge variant="outline">{formatMeetingType(m.type)}</Badge>
                    <span className="text-muted-foreground font-mono text-[11px]">
                      #cycle {m.cycle ?? '—'}
                    </span>
                  </CardTitle>
                  <span className="font-mono text-[11px] text-muted-foreground">{formatTs(m.ts)}</span>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-center justify-between gap-4">
                  <CardDescription className="text-xs shrink-0">参与人</CardDescription>
                  <div className="flex flex-wrap gap-1 justify-end">
                    {(m.participants ?? []).map((p) => (
                      <span
                        key={p}
                        className="inline-flex items-center rounded-sm bg-accent/10 text-accent px-1.5 py-0.5 text-[10.5px] font-mono"
                      >
                        {p}
                      </span>
                    ))}
                    {(m.participants ?? []).length === 0 && (
                      <span className="text-[10.5px] text-muted-foreground">—</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <CardDescription className="text-xs shrink-0">结论</CardDescription>
                  <Badge variant={decisionVariant(m.decision ?? '')}>
                    {m.decision ? (DECISION_LABEL[m.decision] ?? m.decision) : '—'}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
