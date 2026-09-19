'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sparkles, CheckCircle, RefreshCw } from 'lucide-react';

interface LearningEvent {
  ts: string;
  run_id: string;
  kind: string;
  payload: Record<string, unknown>;
}

interface Proposal {
  id: string;
  org_ref?: string;
  rule: string;
  rationale: string;
  status: string;
  evidence: unknown[];
  applied_commit?: string;
}

export function EvolutionPanel() {
  const [events, setEvents] = useState<LearningEvent[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [e, p] = await Promise.all([
        api.listLearningEvents(),
        api.listProposals(),
      ]);
      setEvents((e ?? []) as LearningEvent[]);
      setProposals((p ?? []) as Proposal[]);
      setError(null);
    } catch (err: any) {
      setError(err?.message ?? '无法加载学习数据');
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const act = async (id: string, action: 'approve' | 'reject') => {
    setBusy(id);
    try {
      if (action === 'approve') await api.approveProposal(id);
      else await api.rejectProposal(id);
      await refresh();
    } catch (err: any) {
      setError(err?.message ?? `${action} 失败`);
    } finally {
      setBusy(null);
    }
  };

  if (error) return <div role="alert" className="p-4 text-[12.5px] text-destructive">{error}</div>;

  return (
    <section aria-label="进化面板" className="p-4 space-y-6">
      <header className="flex items-center gap-2">
        <Sparkles size={14} className="text-accent" />
        <h2 className="font-display text-sm font-medium">组织进化</h2>
        <Button size="sm" variant="ghost" onClick={refresh} disabled={busy !== null}>
          <RefreshCw size={12} /> 刷新
        </Button>
      </header>

      <div>
        <h3 className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground mb-2">
          学习事件（{events.length}）
        </h3>
        <ul className="space-y-1">
          {events.slice(-10).map((e, i) => (
            <li key={i} data-kind={e.kind} className="font-mono text-[11px] text-muted-foreground">
              {e.ts} · <Badge variant="outline" className="text-[10px]">{e.kind}</Badge>
            </li>
          ))}
          {events.length === 0 && <li className="text-[12.5px] text-muted-foreground">暂无学习事件</li>}
        </ul>
      </div>

      <div>
        <h3 className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground mb-2">
          组织变更提案
        </h3>
        {proposals.length === 0 && <p className="text-[12.5px] text-muted-foreground">暂无提案</p>}
        <div className="space-y-3">
          {proposals.map(p => (
            <div key={p.id} className="proposal border border-border rounded-sm p-3" data-status={p.status}>
              <div className="flex items-center gap-2 mb-1.5">
                <strong className="font-mono text-[12px]">{p.rule}</strong>
                <Badge variant="outline" className="text-[10px]">{p.status}</Badge>
              </div>
              <p className="text-[12.5px] text-muted-foreground mb-2">{p.rationale}</p>
              <span className="font-mono text-[10.5px] text-muted-foreground">证据 {p.evidence?.length ?? 0} 条</span>
              {p.status === 'proposed' && (
                <div className="flex gap-2 mt-2">
                  <Button size="sm" onClick={() => act(p.id, 'approve')} disabled={busy === p.id}>批准</Button>
                  <Button size="sm" variant="outline" onClick={() => act(p.id, 'reject')} disabled={busy === p.id}>拒绝</Button>
                </div>
              )}
              {p.status === 'applied' && (
                <span className="flex items-center gap-1 font-mono text-[10.5px] text-emerald-400 mt-2">
                  <CheckCircle size={11} /> 已应用 commit {p.applied_commit}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}