'use client';

import { useNavigate } from 'react-router-dom';
import { useMemo, useEffect, useState } from 'react';
import { useUiStore } from '@/stores/ui-store';
import { api } from '@/api';
import { t } from '@/i18n';
import { ShieldCheck, AlertTriangle, XCircle, CheckCircle, Info } from 'lucide-react';

interface ValidationCheck {
  id: string;
  severity: 'pass' | 'warning' | 'error';
  title: string;
  description?: string;
  fixTarget?: 'structure' | 'workflow' | 'skills' | 'settings';
}

interface Props {
  orgId: string;
  depts: any[];
  currentOrg: any;
}

const FIX_TARGET_LABELS: Record<string, string> = {
  structure: '组织结构',
  workflow: '工作流',
  skills: '技能绑定',
  settings: '诊断',
};

function fixTargetLabel(t: string): string {
  return FIX_TARGET_LABELS[t] ?? t;
}

export function ValidationPanel({ orgId, depts, currentOrg }: Props) {
  const navigate = useNavigate();
  const [health, setHealth] = useState<any>(null);
  const [workflowStats, setWorkflowStats] = useState<any>(null);

  useEffect(() => {
    api.getHealth().then(setHealth).catch(() => {});
    if (orgId && orgId !== 'new') {
      api.getOrgWorkflowStats(orgId).then(setWorkflowStats).catch(() => {});
    }
  }, [orgId]);

  const checks: ValidationCheck[] = useMemo(() => {
    const results: ValidationCheck[] = [];

    results.push({
      id: 'schema',
      severity: currentOrg ? 'pass' : 'error',
      title: '组织配置 Schema 合法',
      description: currentOrg ? '配置结构与 Schema 匹配' : '未加载组织配置',
    });

    results.push({
      id: 'departments',
      severity: depts.length > 0 ? 'pass' : 'error',
      title: '已定义部门',
      description: `${depts.length} 个部门`,
      fixTarget: 'structure',
    });

    const emptyDepts = depts.filter((d: any) => !d.roles || d.roles.length === 0);
    results.push({
      id: 'roles',
      severity: emptyDepts.length === 0 ? 'pass' : 'error',
      title: '每个部门都有角色',
      description:
        emptyDepts.length > 0
          ? `${emptyDepts.map((d: any) => d.name).join(', ')} 没有任何角色`
          : '所有部门至少有一个角色',
      fixTarget: 'structure',
    });

    const noAgent = depts.flatMap((d: any) => d.roles || []).filter((r: any) => !r.agentType);
    results.push({
      id: 'agentType',
      severity: noAgent.length === 0 ? 'pass' : 'warning',
      title: '角色已分配智能体类型',
      description: noAgent.length > 0 ? `${noAgent.length} 个角色缺少智能体类型` : '所有角色都有智能体类型',
      fixTarget: 'structure',
    });

    const noSkill = depts.flatMap((d: any) => d.roles || []).filter((r: any) => !r.bound_skill);
    results.push({
      id: 'boundSkill',
      severity: noSkill.length === 0 ? 'pass' : 'warning',
      title: '角色已绑定技能',
      description: noSkill.length > 0 ? `${noSkill.length} 个角色缺少绑定技能` : '所有角色都已绑定技能',
      fixTarget: 'skills',
    });

    const wfNodeCount = workflowStats?.nodeCount ?? 0;
    results.push({
      id: 'workflowGraph',
      severity: wfNodeCount > 0 ? 'pass' : 'warning',
      title: '工作流图非空',
      description: wfNodeCount > 0 ? `已定义 ${wfNodeCount} 个节点` : '未定义工作流节点',
      fixTarget: 'workflow',
    });

    const isolated = workflowStats?.isolatedNodes ?? 0;
    results.push({
      id: 'workflowConnectivity',
      severity: isolated === 0 ? 'pass' : 'warning',
      title: '工作流没有孤立节点',
      description: isolated === 0 ? '所有节点已连接' : `${isolated} 个节点无连接`,
      fixTarget: 'workflow',
    });

    results.push({
      id: 'harness',
      severity: health?.harness?.available ? 'pass' : 'warning',
      title: '编排器适配器可用',
      description: health?.harness?.path
        ? `位于 ${health.harness.path.split(/[/\\]/).slice(-2).join('/')}`
        : '未找到二进制文件',
      fixTarget: 'settings',
    });

    results.push({
      id: 'schemaFile',
      severity: health?.schema?.available ? 'pass' : 'warning',
      title: 'Schema 文件可用',
      description: health?.schema?.path
        ? `位于 ${health.schema.path.split(/[/\\]/).slice(-2).join('/')}`
        : '未找到 Schema 文件',
    });

    return results;
  }, [depts, currentOrg, health, workflowStats]);

  const iconFor = (severity: string) => {
    switch (severity) {
      case 'pass': return <CheckCircle size={16} className="text-emerald-400" />;
      case 'warning': return <AlertTriangle size={16} className="text-amber-400" />;
      case 'error': return <XCircle size={16} className="text-destructive" />;
      default: return <Info size={16} className="text-muted-foreground" />;
    }
  };

  const errors = checks.filter((c) => c.severity === 'error').length;
  const warnings = checks.filter((c) => c.severity === 'warning').length;
  const passed = checks.filter((c) => c.severity === 'pass').length;

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-2">
        <ShieldCheck size={16} className="text-accent" />
        <h3 className="font-display text-base font-medium tracking-[-0.01em]">起飞前校验</h3>
        <div className="flex gap-2 ml-auto">
          <span className="mono-num text-[11px] text-emerald-400">{passed} 通过</span>
          {warnings > 0 && <span className="mono-num text-[11px] text-amber-400">{warnings} 警告</span>}
          {errors > 0 && <span className="mono-num text-[11px] text-destructive">{errors} 失败</span>}
        </div>
      </div>

      <p className="text-[12.5px] text-muted-foreground max-w-[60ch]">
        启动前运行这些检查以捕获常见的配置问题。
      </p>

      <div className="space-y-1">
        {checks.map((check) => (
          <div
            key={check.id}
            className={`flex items-center gap-3 p-3 rounded-sm border ${
              check.severity === 'error'
                ? 'border-destructive/30 bg-destructive/5'
                : check.severity === 'warning'
                ? 'border-amber-500/20 bg-amber-500/5'
                : 'border-border'
            }`}
          >
            {iconFor(check.severity)}
            <div className="flex-1 min-w-0">
              <div className="font-mono text-[12px] text-foreground">{check.title}</div>
              {check.description && (
                <div className="font-mono text-[10.5px] text-muted-foreground truncate">{check.description}</div>
              )}
            </div>
            {check.fixTarget && check.severity !== 'pass' && (
              <button
                className="text-[10.5px] font-mono text-accent hover:underline whitespace-nowrap"
                onClick={() => {
                  const tabMap: Record<string, 'structure' | 'workflow' | 'skills' | 'validation' | 'run'> = {
                    structure: 'structure',
                    workflow: 'workflow',
                    skills: 'skills',
                    settings: 'run',
                  };
                  const tab = check.fixTarget ? tabMap[check.fixTarget] : null;
                  if (tab) {
                    useUiStore.getState().setEditorTab(tab);
                    if (check.fixTarget === 'settings') navigate('/health');
                  }
                }}
              >
                {check.fixTarget === 'settings'
                  ? t('Open Diagnostics')
                  : `修复于 ${fixTargetLabel(check.fixTarget)}`}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}