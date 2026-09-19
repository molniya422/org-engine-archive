'use client';

import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { PlaybookParameterForm } from './PlaybookParameterForm';
import type { PlaybookParameter } from './PlaybookParameterForm';
import { api } from '@/api';
import { useWorkflowStore } from '@/stores/workflow-store';
import { useUiStore } from '@/stores/ui-store';
import { X, ChevronRight } from 'lucide-react';

interface PlaybookDetailPanelProps {
  playbookId: string | null;
  onClose: () => void;
}

const APPLY_MODES = [
  { value: 'workflow_only', label: '仅工作流' },
  { value: 'create_org', label: '新建组织' },
  { value: 'apply_to_org', label: '应用到当前组织' },
] as const;

const STAGE_KIND_LABEL: Record<string, string> = {
  validate: '校验',
  transform: '转换',
  execute: '执行',
  review: '审阅',
  export: '导出',
};

export function PlaybookDetailPanel({ playbookId, onClose }: PlaybookDetailPanelProps) {
  const navigate = useNavigate();
  const [playbook, setPlaybook] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [params, setParams] = useState<Record<string, string>>({});
  const [paramErrors, setParamErrors] = useState<Record<string, string>>({});
  const [mode, setMode] = useState<string>('workflow_only');
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);

  useEffect(() => {
    if (!playbookId) {
      setPlaybook(null);
      return;
    }
    setLoading(true);
    setError(null);
    setApplyError(null);
    setApplying(false);
    setParamErrors({});
    setMode('workflow_only');

    api
      .getPlaybook(playbookId)
      .then((data) => {
        setPlaybook(data);
        const initial: Record<string, string> = {};
        (data.parameters || []).forEach((p: PlaybookParameter) => {
          initial[p.key] = p.defaultValue !== undefined ? String(p.defaultValue) : '';
        });
        setParams(initial);
        setLoading(false);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : '加载失败');
        setLoading(false);
      });
  }, [playbookId]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    if (playbookId) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [playbookId, onClose]);

  const handleChange = useCallback((key: string, value: string) => {
    setParams((prev) => ({ ...prev, [key]: value }));
    setParamErrors((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setApplyError(null);
  }, []);

  const handleApply = useCallback(async () => {
    if (!playbookId) return;

    // Validate required params
    const newErrors: Record<string, string> = {};
    if (playbook?.parameters) {
      for (const p of playbook.parameters as PlaybookParameter[]) {
        if (p.required && !params[p.key]?.trim()) {
          newErrors[p.key] = `${p.label} 是必填项`;
        }
      }
    }
    setParamErrors(newErrors);
    if (Object.keys(newErrors).length > 0) return;

    setApplying(true);
    setApplyError(null);
    try {
      const result = await api.applyPlaybook(playbookId, mode, params as Record<string, unknown>);

      // Load workflow into store + auto-layout so nodes are visible
      if (result?.workflow) {
        const store = useWorkflowStore.getState();
        store.loadWorkflow(
          result.workflow.nodes as any,
          result.workflow.edges as any,
        );
        // Give React a tick then layout — positions from backend are linear and easy to miss
        try {
          store.autoLayout();
        } catch {
          /* layout is best-effort */
        }
      }

      // Force workflow tab BEFORE navigate — don't rely solely on ?tab= (hash quirks)
      useUiStore.getState().setEditorTab('workflow');

      // workflow_only：走 draft 路由，避免被 NewOrgForm 截断
      // create_org / apply_to_org：优先使用返回的 orgId
      const orgId =
        mode === 'workflow_only'
          ? 'draft'
          : (result?.orgId || 'new');
      // 节点已 loadWorkflow，不再带 playbook 查询参数，避免 Studio 二次 apply
      // HashRouter: put search inside the location object explicitly
      navigate({ pathname: `/studio/${orgId}`, search: '?tab=workflow' });
    } catch (err) {
      setApplyError(err instanceof Error ? err.message : '应用失败');
      setApplying(false);
    }
  }, [playbookId, playbook, params, mode, navigate]);

  if (!playbookId) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <Card
        variant="glass"
        className="w-full max-w-2xl max-h-[85vh] flex flex-col"
      >
        <CardHeader className="flex flex-row items-start justify-between gap-4 shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <CardTitle className="truncate">
                {loading ? '加载中...' : playbook?.name}
             </CardTitle>
              {!loading && playbook?.category && (
                <Badge variant="accent" className="shrink-0">
                  {STAGE_KIND_LABEL[playbook.category] ?? playbook.category}
               </Badge>
              )}
           </div>
            {!loading && playbook?.description && (
              <p className="text-[12.5px] text-muted-foreground leading-relaxed">
                {playbook.description}
             </p>
            )}
         </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="shrink-0">
            <X className="w-4 h-4" />
         </Button>
       </CardHeader>

        <CardContent className="overflow-y-auto">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <span className="w-5 h-5 border-2 border-border border-t-accent rounded-full animate-spin" />
           </div>
          )}

          {error && !loading && (
            <div className="p-3 rounded-md bg-destructive/10 border border-destructive/20 text-destructive text-[12px] font-mono">
              {error}
           </div>
          )}

          {!loading && !error && playbook && (
            <div className="space-y-6">
              {/* Pipeline Stages */}
              {playbook.stages && playbook.stages.length > 0 && (
                <div>
                  <Label className="font-mono text-[12px] mb-2 block">阶段流水线</Label>
                  <div className="flex items-center gap-1 flex-wrap">
                    {playbook.stages.flatMap((stage: any, idx: number) => {
                      const elements: React.ReactNode[] = [];
                      const label = STAGE_KIND_LABEL[stage.kind] ?? stage.title ?? stage.kind ?? stage.id;
                      elements.push(
                        <Badge key={`s-${idx}`} variant="outline" className="text-[10px]">
                          {label}
                       </Badge>,
                      );
                      if (idx < playbook.stages.length - 1) {
                        elements.push(
                          <ChevronRight key={`c-${idx}`} className="w-3.5 h-3.5 text-muted-foreground shrink-0" />,
                        );
                      }
                      return elements;
                    })}
                 </div>
               </div>
              )}

              {/* Parameters */}
              <div>
                <Label className="font-mono text-[12px] mb-2 block">参数</Label>
                <PlaybookParameterForm
                  parameters={playbook.parameters || []}
                  values={params}
                  onChange={handleChange}
                  errors={paramErrors}
                />
             </div>

              {/* Apply Mode */}
              <div>
                <Label className="font-mono text-[12px] mb-2 block">应用模式</Label>
                <div className="flex gap-1">
                  {APPLY_MODES.map((m) => (
                    <Button
                      key={m.value}
                      variant={mode === m.value ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setMode(m.value)}
                    >
                      {m.label}
                   </Button>
                  ))}
               </div>
             </div>

              {/* Apply Error Banner */}
              {applyError && (
                <div className="p-3 rounded-md bg-destructive/10 border border-destructive/20 text-destructive text-[12px] font-mono">
                  {applyError}
               </div>
              )}

              {/* Apply Button */}
              <Button className="w-full" onClick={handleApply} disabled={applying || loading}>
                {applying ? (
                  <>
                    <span className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />
                    应用中...
                  </>
                ) : (
                  '应用剧本'
                )}
             </Button>
           </div>
          )}
       </CardContent>
     </Card>
   </div>
  );
}