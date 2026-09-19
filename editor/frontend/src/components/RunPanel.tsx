'use client';

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { api } from '@/api';
import {
  Play,
  AlertTriangle,
  CheckCircle,
  Workflow as WorkflowIcon,
  History,
  ArrowUpRight,
} from 'lucide-react';

interface Props {
  orgId: string;
  currentOrg: any;
  setRunDialogOpen: (open: boolean) => void;
}

export function RunPanel({ orgId, currentOrg, setRunDialogOpen }: Props) {
  const navigate = useNavigate();
  const [task, setTask] = useState('');
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<any>(null);
  const [recentRuns, setRecentRuns] = useState<any[]>([]);

  useEffect(() => {
    if (orgId && orgId !== 'new') {
      api.getOrgWorkflowStats(orgId).then(setStats).catch(() => {});
      api.listRuns(orgId, 5).then((r) => setRecentRuns(r.runs ?? [])).catch(() => {});
    }
  }, [orgId]);

  const depts = currentOrg?.org?.departments ?? [];
  const allRoles = depts.flatMap((d: any) => d.roles || []);
  const missingSkills = allRoles.filter((r: any) => !r.bound_skill).length;
  const hasBlockingIssues = depts.length === 0 || allRoles.length === 0;

  const handleRun = async () => {
    if (!task.trim()) return;
    setRunning(true);
    setError(null);
    try {
      const result = await api.startRun(orgId, task.trim());
      if (result?.run_id) {
        navigate(`/studio/${orgId}/runs/${result.run_id}`);
      }
    } catch (err: any) {
      setError(err instanceof Error ? err.message : '启动运行失败');
    }
    setRunning(false);
  };

  const runStatusVariant: Record<string, 'default' | 'accent' | 'muted' | 'destructive' | 'outline'> = {
    queued: 'muted',
    running: 'accent',
    awaiting_user: 'outline',
    done: 'muted',
    cancelled: 'outline',
    blocked: 'destructive',
  };

  const statusLabel: Record<string, string> = {
    queued: '排队中',
    running: '运行中',
    awaiting_user: '等待用户',
    done: '已完成',
    cancelled: '已取消',
    blocked: '已阻塞',
  };

  return (
    <div className="p-4 space-y-5">
      <div className="flex items-center gap-2">
        <Play size={16} className="text-accent" />
        <h3 className="font-display text-base font-medium tracking-[-0.01em]">启动运行</h3>
      </div>

      {/* Org summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="p-3 rounded-sm border border-border">
          <div className="mono-num text-lg text-foreground">{depts.length}</div>
          <div className="font-mono text-[10.5px] text-muted-foreground tracking-[0.02em]">部门</div>
        </div>
        <div className="p-3 rounded-sm border border-border">
          <div className="mono-num text-lg text-foreground">{allRoles.length}</div>
          <div className="font-mono text-[10.5px] text-muted-foreground tracking-[0.02em]">角色</div>
        </div>
        <div className="p-3 rounded-sm border border-border">
          <div className="mono-num text-lg text-foreground">{missingSkills}</div>
          <div className="font-mono text-[10.5px] text-muted-foreground tracking-[0.02em]">未绑定技能</div>
        </div>
      </div>

      {/* Workflow summary */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <WorkflowIcon size={13} className="text-muted-foreground" />
          <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground">工作流概要</span>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="p-3 rounded-sm border border-border">
            <div className="mono-num text-lg text-foreground">{stats?.nodeCount ?? 0}</div>
            <div className="font-mono text-[10.5px] text-muted-foreground tracking-[0.02em]">节点</div>
          </div>
          <div className="p-3 rounded-sm border border-border">
            <div className="mono-num text-lg text-foreground">{stats?.edgeCount ?? 0}</div>
            <div className="font-mono text-[10.5px] text-muted-foreground tracking-[0.02em]">连接</div>
          </div>
          <div className="p-3 rounded-sm border border-border">
            <div className={`mono-num text-lg ${(stats?.isolatedNodes ?? 0) > 0 ? 'text-amber-400' : 'text-foreground'}`}>
              {stats?.isolatedNodes ?? 0}
            </div>
            <div className="font-mono text-[10.5px] text-muted-foreground tracking-[0.02em]">孤立</div>
          </div>
        </div>
      </div>

      {/* Validation gate */}
      {hasBlockingIssues ? (
        <div className="flex items-center gap-2 p-3 rounded-sm border border-destructive/30 bg-destructive/5">
          <AlertTriangle size={14} className="text-destructive shrink-0" />
          <span className="font-mono text-[11px] text-destructive">
            校验存在阻塞问题。请先添加部门和角色。
          </span>
        </div>
      ) : (
        <div className="flex items-center gap-2 p-3 rounded-sm border border-emerald-500/20 bg-emerald-500/5">
          <CheckCircle size={14} className="text-emerald-400 shrink-0" />
          <span className="font-mono text-[11px] text-emerald-300">
            所有基础检查通过，可以启动。
          </span>
        </div>
      )}

      {/* Task input */}
      <div className="space-y-2">
        <label className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
          任务描述
        </label>
        <textarea
          className="flex h-24 w-full rounded-sm border border-border bg-background px-3 py-2 font-mono text-[12.5px] chrome-hairline resize-none"
          placeholder="描述多智能体编排的任务..."
          value={task}
          onChange={(e) => setTask(e.target.value)}
        />
      </div>

      {error && (
        <div className="p-3 rounded-sm bg-destructive/10 text-destructive font-mono text-[11px]">
          {error}
        </div>
      )}

      <Button
        variant="accent"
        size="lg"
        className="w-full"
        disabled={hasBlockingIssues || !task.trim() || running || orgId === 'draft' || orgId === 'new'}
        onClick={handleRun}
      >
        {running ? '启动中...' : <><Play size={14} /> 启动运行</>}
      </Button>

      {/* Recent runs */}
      {recentRuns.length > 0 && (
        <div className="space-y-2 pt-2 border-t border-border">
          <div className="flex items-center gap-2">
            <History size={13} className="text-muted-foreground" />
            <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground">历史运行</span>
          </div>
          <div className="space-y-1">
            {recentRuns.map((r) => (
              <button
                key={r.runId}
                onClick={() => navigate(`/studio/${orgId}/runs/${r.runId}`)}
                className="w-full flex items-center gap-3 p-2.5 rounded-sm border border-border hover:border-accent/40 hover:bg-secondary/30 transition-colors text-left"
              >
                <div className="flex-1 min-w-0">
                  <div className="font-mono text-[12px] text-foreground truncate">{r.task}</div>
                  <div className="font-mono text-[10.5px] text-muted-foreground mt-0.5">
                    {r.runId?.slice(0, 12) ?? '—'}
                    {r.startedAt &&
                      ` · ${new Date(r.startedAt).toLocaleString('zh-CN', { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' })}`}
                  </div>
                </div>
                <Badge variant={runStatusVariant[r.status] || 'outline'} className="text-[10px]">{statusLabel[r.status] || r.status}</Badge>
                <ArrowUpRight size={13} className="text-muted-foreground" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}