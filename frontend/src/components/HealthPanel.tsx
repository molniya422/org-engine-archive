'use client';

import { useEffect, useState } from 'react';
import { api } from '@/api';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import {
  ShieldCheck,
  CheckCircle,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Server,
  FileCode,
  Cpu,
  Package,
  Clock,
  Layers,
} from 'lucide-react';

interface HealthState {
  backend: 'ok' | string;
  uptimeMs?: number;
  playbookCount: number;
  playbooks?: { id: string; name: string; category: string; stages: number }[];
  schema: { available: boolean; path: string | null; candidates: { path: string; exists: boolean }[] };
  harness: { available: boolean; path: string | null; candidates: { path: string; exists: boolean }[] };
  packaged: boolean;
  resourcesPath?: string | null;
  cwd?: string;
  version?: string;
}

function uptimeHuman(ms?: number): string {
  if (!ms || ms < 0) return '—';
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}时 ${m % 60}分`;
  if (m > 0) return `${m}分 ${s % 60}秒`;
  return `${s}秒`;
}

const CATEGORY_LABEL: Record<string, string> = {
  scaffold: '搭建',
  audit: '审计',
  deploy: '部署',
  research: '研究',
  custom: '自定义',
};

export function HealthPanel({ compact = false }: { compact?: boolean }) {
  const [health, setHealth] = useState<HealthState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getHealth();
      setHealth(data);
    } catch (e: any) {
      setError(e instanceof Error ? e.message : '加载诊断信息失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  if (loading && !health) {
    return (
      <div className="p-4 space-y-3">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4">
        <div className="p-3 rounded-sm border border-destructive/30 bg-destructive/5 text-destructive font-mono text-[12px]">
          {error}
        </div>
      </div>
    );
  }

  if (!health) return null;

  const StatusIcon = ({ ok }: { ok: boolean }) =>
    ok ? (
      <CheckCircle size={14} className="text-emerald-400" />
    ) : (
      <XCircle size={14} className="text-destructive" />
    );

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-2">
        <ShieldCheck size={16} className="text-accent" />
        <h3 className="font-display text-base font-medium tracking-[-0.01em]">诊断</h3>
        <div className="flex gap-2 ml-auto">
          <Button size="sm" variant="ghost" onClick={load}>
            <RefreshCw size={12} />
            刷新
          </Button>
        </div>
      </div>

      <p className="text-[12.5px] text-muted-foreground max-w-[60ch]">
        打包与运行时诊断，方便在无终端环境下排查 Electron 打包问题。
      </p>

      {/* Backend status card */}
      <Card variant="flat">
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-[12.5px] flex items-center gap-2">
            <Server size={13} className="text-muted-foreground" />
            后端
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-2">
          <div className="grid grid-cols-2 gap-3 text-[12px]">
            <div className="flex items-center gap-2">
              <StatusIcon ok={health.backend === 'ok'} />
              <span className="font-mono">状态</span>
              <Badge variant={health.backend === 'ok' ? 'muted' : 'destructive'} className="ml-auto">
                {health.backend === 'ok' ? '正常' : health.backend}
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              <Clock size={13} className="text-muted-foreground" />
              <span className="font-mono">运行时长</span>
              <span className="font-mono text-muted-foreground ml-auto">
                {uptimeHuman(health.uptimeMs)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Package size={13} className="text-muted-foreground" />
              <span className="font-mono">模式</span>
              <Badge variant={health.packaged ? 'outline' : 'muted'} className="ml-auto">
                {health.packaged ? '已打包' : '开发'}
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-mono">版本</span>
              <span className="font-mono text-muted-foreground ml-auto">{health.version ?? '未知'}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Playbooks card */}
      <Card variant="flat">
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-[12.5px] flex items-center gap-2">
            <Layers size={13} className="text-muted-foreground" />
            剧本库
            <Badge variant="muted" className="ml-auto mono-num">
              {health.playbookCount}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-3">
          <div className="space-y-1">
            {(health.playbooks ?? []).map((p) => (
              <div key={p.id} className="flex items-center gap-2 py-1 text-[12px]">
                <span className="font-mono flex-1 truncate">{p.name}</span>
                <Badge variant="accent" className="text-[10px]">{CATEGORY_LABEL[p.category] ?? p.category}</Badge>
                <span className="font-mono text-[11px] text-muted-foreground mono-num">
                  {p.stages} 个阶段
                </span>
              </div>
            ))}
            {(!health.playbooks || health.playbooks.length === 0) && (
              <div className="text-[12px] text-muted-foreground font-mono py-2">
                未注册剧本
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Schema card */}
      <Card variant="flat">
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-[12.5px] flex items-center gap-2">
            <FileCode size={13} className="text-muted-foreground" />
            Schema 路径
            <Badge variant={health.schema.available ? 'muted' : 'destructive'} className="ml-auto">
              {health.schema.available ? '已找到' : '缺失'}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-3 space-y-2">
          {health.schema.path && (
            <div className="font-mono text-[11px] text-foreground break-all p-2 rounded-sm bg-secondary/30">
              {health.schema.path}
            </div>
          )}
          {!compact && (
            <details className="text-[11px]">
              <summary className="font-mono text-muted-foreground cursor-pointer hover:text-foreground">
                已探测 {health.schema.candidates.length} 个候选路径
              </summary>
              <div className="mt-2 space-y-0.5">
                {health.schema.candidates.map((c, i) => (
                  <div key={i} className="flex items-center gap-2 font-mono text-[10.5px]">
                    <StatusIcon ok={c.exists} />
                    <span className="truncate text-muted-foreground">{c.path}</span>
                  </div>
                ))}
              </div>
            </details>
          )}
        </CardContent>
      </Card>

      {/* Harness card */}
      <Card variant="flat">
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-[12.5px] flex items-center gap-2">
            <Cpu size={13} className="text-muted-foreground" />
            编排器适配器
            <Badge variant={health.harness.available ? 'muted' : 'destructive'} className="ml-auto">
              {health.harness.available ? '已找到' : '缺失'}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-3 space-y-2">
          {health.harness.path && (
            <div className="font-mono text-[11px] text-foreground break-all p-2 rounded-sm bg-secondary/30">
              {health.harness.path}
            </div>
          )}
          {!health.harness.available && (
            <div className="flex items-center gap-2 text-[11px] text-amber-400 font-mono">
              <AlertTriangle size={12} />
              没有适配器二进制文件将无法执行运行流水线
            </div>
          )}
        </CardContent>
      </Card>

      {/* Runtime paths */}
      {(health.resourcesPath || health.cwd) && (
        <Card variant="flat">
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-[12.5px]">运行时路径</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3 space-y-2 text-[11px] font-mono">
            {health.cwd && (
              <div className="flex gap-2">
                <span className="text-muted-foreground shrink-0 w-20">当前目录</span>
                <span className="truncate">{health.cwd}</span>
              </div>
            )}
            {health.resourcesPath && (
              <div className="flex gap-2">
                <span className="text-muted-foreground shrink-0 w-20">资源</span>
                <span className="truncate">{health.resourcesPath}</span>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
