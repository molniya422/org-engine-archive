import { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useOrgStore } from '@/stores/org-store';
import { useUiStore } from '@/stores/ui-store';
import { useWorkflowStore } from '@/stores/workflow-store';
import { api } from '@/api';
import { OrgTreeView } from '@/components/OrgTreeView';
import { OrgCanvasView } from '@/components/OrgCanvasView';
import { RoleEditor } from '@/components/RoleEditor';
import { NewOrgForm } from '@/components/NewOrgForm';
import { ExportMenu } from '@/components/ExportMenu';
import { RunDialog } from '@/components/RunDialog';
import { WorkflowCanvas, WorkflowToolbar, PropertiesPanel } from '@/components/workflow';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { ValidationPanel } from '@/components/ValidationPanel';
import { RunPanel } from '@/components/RunPanel';
import { EvolutionPanel } from '@/components/EvolutionPanel';
import { t } from '@/i18n';
import {
  GitBranch, Workflow, Cpu, ShieldCheck, Play, Plus, RefreshCw, CheckCircle, XCircle, Sparkles,
} from 'lucide-react';

type EditorTab = 'structure' | 'workflow' | 'skills' | 'validation' | 'run' | 'evolution';

const TAB_LABELS: Record<EditorTab, string> = {
  structure: '组织结构',
  workflow: '工作流',
  skills: '技能绑定',
  validation: '校验',
  run: '运行',
  evolution: '进化',
};

export function StudioView() {
  const { orgId } = useParams<{ orgId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const { currentOrg, loading, error, loadOrg, saveOrg } = useOrgStore();
  const { editorTab, setEditorTab } = useUiStore();
  const workflowNodes = useWorkflowStore((s) => s.nodes);
  const [structureView, setStructureView] = useState<'tree' | 'graph'>('tree');
  const [selectedRole, setSelectedRole] = useState<{ deptIdx: number; roleIdx: number } | null>(null);
  const [runDialogOpen, setRunDialogOpen] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  useEffect(() => {
    if (orgId && orgId !== 'new' && orgId !== 'draft') loadOrg(orgId);
  }, [orgId, loadOrg]);

  // Restore a persisted workflow into the store when the org loads.
  // Preserve the saved positions — do NOT re-run autoLayout here, otherwise
  // the user's manual arrangement gets scrambled on every reload.
  useEffect(() => {
    if (!currentOrg?.workflow) return;
    const wf = currentOrg.workflow;
    if (wf.nodes?.length && useWorkflowStore.getState().nodes.length === 0) {
      useWorkflowStore.getState().loadWorkflow(wf.nodes as any, wf.edges as any);
    }
  }, [currentOrg]);

  // Apply ?tab= once, then strip it from the URL (hash-safe)
  useEffect(() => {
    const tabParam = searchParams.get('tab');
    if (tabParam && ['structure', 'workflow', 'skills', 'validation', 'run'].includes(tabParam)) {
      setEditorTab(tabParam as EditorTab);
      const newParams = new URLSearchParams(searchParams);
      newParams.delete('tab');
      setSearchParams(newParams, { replace: true });
    }
  }, [searchParams, setEditorTab, setSearchParams]);

  // Draft with nodes already in store → force workflow tab (covers race after apply)
  useEffect(() => {
    if ((orgId === 'draft' || orgId === 'new') && workflowNodes.length > 0) {
      if (editorTab === 'structure') setEditorTab('workflow');
    }
  }, [orgId, workflowNodes.length, editorTab, setEditorTab]);

  // Deep-link: only re-apply when workflow store is empty (avoid double-apply after DetailPanel)
  useEffect(() => {
    const playbookId = searchParams.get('playbook');
    if (!playbookId) return;

    if (useWorkflowStore.getState().nodes.length > 0) {
      setEditorTab('workflow');
      const newParams = new URLSearchParams(searchParams);
      newParams.delete('playbook');
      setSearchParams(newParams, { replace: true });
      return;
    }

    api
      .getPlaybook(playbookId)
      .then((pb) => {
        const params: Record<string, unknown> = {};
        for (const p of pb?.parameters || []) {
          if (p.defaultValue !== undefined && p.defaultValue !== null) {
            params[p.key] = p.defaultValue;
          } else if (p.required) {
            params[p.key] = p.type === 'number' ? 0 : `auto-${p.key}`;
          }
        }
        return api.applyPlaybook(
          playbookId,
          'workflow_only',
          params,
          orgId && orgId !== 'new' && orgId !== 'draft' ? orgId : undefined,
        );
      })
      .then((result) => {
        if (result?.workflow) {
          const store = useWorkflowStore.getState();
          store.loadWorkflow(result.workflow.nodes as any, result.workflow.edges as any);
          try { store.autoLayout(); } catch { /* ignore */ }
          setEditorTab('workflow');
        }
        const newParams = new URLSearchParams(searchParams);
        newParams.delete('playbook');
        setSearchParams(newParams, { replace: true });
      })
      .catch((err) => {
        console.error('加载剧本失败:', err);
      });
  }, [orgId, searchParams, setEditorTab, setSearchParams]);

  const handleRoleSelect = (deptIdx: number, roleIdx: number) => {
    setSelectedRole({ deptIdx, roleIdx });
  };

  const handleRoleUpdate = (updatedRole: any) => {
    if (!currentOrg || !selectedRole) return;
    const dept = currentOrg.org.departments[selectedRole.deptIdx];
    if (dept) {
      dept.roles[selectedRole.roleIdx] = updatedRole;
      queueSave();
    }
  };

  const handleAddDepartment = () => {
    if (!currentOrg) return;
    currentOrg.org.departments.push({
      // dept name must match ^[A-Za-z][A-Za-z0-9_-]*$ — keep schema-valid
      name: `Dept_${currentOrg.org.departments.length}`,
      description: 'New department',
      roles: [{
        // role name must match ^[a-z][a-z0-9_]*$
        name: 'new_role',
        agentType: 'general-purpose',
        bound_skill: '',
      }],
    });
    queueSave();
  };

  const handleAddRole = (deptIdx: number) => {
    if (!currentOrg) return;
    currentOrg.org.departments[deptIdx].roles.push({
      name: 'new_role',
      agentType: 'general-purpose',
      bound_skill: '',
    });
    queueSave();
  };

  // Debounced save — role edits fire on every keystroke, so coalesce them
  // into a single PUT with a visible "保存中 / 已保存" indicator.
  const saveTimer = useRef<number | null>(null);
  const queueSave = () => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    setSaveState('saving');
    saveTimer.current = window.setTimeout(async () => {
      try {
        await saveOrg(orgId!, currentOrg);
        setSaveState('saved');
        window.setTimeout(() => setSaveState((s) => (s === 'saved' ? 'idle' : s)), 2000);
      } catch {
        setSaveState('error');
      } finally {
        saveTimer.current = null;
      }
    }, 600);
  };
  useEffect(() => () => { if (saveTimer.current) window.clearTimeout(saveTimer.current); }, []);

  const isDraftWorkflow = orgId === 'new' || orgId === 'draft';
  const hasWorkflowDraft = workflowNodes.length > 0 || !!searchParams.get('playbook');

  // Draft with loaded nodes should open on workflow, not structure/NewOrgForm
  const effectiveTab: EditorTab =
    isDraftWorkflow && hasWorkflowDraft && editorTab === 'structure' && !currentOrg
      ? 'workflow'
      : (editorTab as EditorTab);

  if (loading && !isDraftWorkflow) return (
    <div className="flex items-center justify-center h-48 gap-4">
      <Skeleton className="h-6 w-40" />
    </div>
  );
  if (error && !isDraftWorkflow) return (
    <div className="flex items-center justify-center h-48 text-destructive mono-num text-sm">{error}</div>
  );
  // 仅工作流模式：允许无组织时直接编辑画布
  if (!currentOrg && isDraftWorkflow && !hasWorkflowDraft && effectiveTab === 'structure') {
    return <NewOrgForm />;
  }
  if (!currentOrg && !isDraftWorkflow) return (
    <div className="flex items-center justify-center h-48 text-muted-foreground mono-num text-sm">
      未找到组织
    </div>
  );

  const depts = currentOrg?.org?.departments ?? [];
  const tabValue = effectiveTab as string;

  return (
    <div className="flex flex-col h-full min-h-0 w-full">
      {/* Tab Bar */}
      <header className="flex items-center h-11 px-4 border-b border-border chrome-hairline bg-background/95 shrink-0 gap-2">
        <Tabs value={tabValue} onValueChange={(v) => setEditorTab(v as EditorTab)}>
          <TabsList className="h-8">
            <TabsTrigger value="structure" className="text-[12px] gap-1.5">
              <GitBranch size={14} /> {TAB_LABELS.structure}
           </TabsTrigger>
            <TabsTrigger value="workflow" className="text-[12px] gap-1.5">
              <Workflow size={14} /> {TAB_LABELS.workflow}
           </TabsTrigger>
            <TabsTrigger value="skills" className="text-[12px] gap-1.5">
              <Cpu size={14} /> {TAB_LABELS.skills}
           </TabsTrigger>
            <TabsTrigger value="validation" className="text-[12px] gap-1.5">
              <ShieldCheck size={14} /> {TAB_LABELS.validation}
           </TabsTrigger>
            <TabsTrigger value="run" className="text-[12px] gap-1.5">
              <Play size={14} /> {TAB_LABELS.run}
           </TabsTrigger>
            <TabsTrigger value="evolution" className="text-[12px] gap-1.5">
              <Sparkles size={14} /> {TAB_LABELS.evolution}
           </TabsTrigger>
         </TabsList>
       </Tabs>

        <div className="flex-1" />

        <div className="flex items-center gap-2">
          {currentOrg && (
            <span
              className="flex items-center gap-1.5 font-mono text-[10.5px]"
              data-testid="save-indicator"
              data-state={saveState}
            >
              {saveState === 'saving' && (
                <><RefreshCw size={11} className="animate-spin text-muted-foreground" /> 保存中…</>
              )}
              {saveState === 'saved' && (
                <><CheckCircle size={11} className="text-emerald-400" /> 已保存</>
              )}
              {saveState === 'error' && (
                <><XCircle size={11} className="text-destructive" /> 保存失败</>
              )}
            </span>
          )}
          {currentOrg && (
            <ExportMenu orgId={orgId!} orgName={currentOrg.org?.name ?? orgId!} />
          )}
          {currentOrg && (
            <Button size="sm" variant="outline" onClick={handleAddDepartment}>
              <Plus size={13} /> 添加部门
            </Button>
          )}
          {!currentOrg && isDraftWorkflow && (
            <Badge variant="outline" className="text-[10px]">仅工作流草稿</Badge>
          )}
        </div>
     </header>

      {/* Run Dialog */}
      {currentOrg && (
        <RunDialog orgId={orgId!} open={runDialogOpen} onClose={() => setRunDialogOpen(false)} />
      )}

      {/* Main Content — min-h-0 critical for ReactFlow height chain */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {effectiveTab === 'structure' && (
          currentOrg ? (
            <div className="flex h-full min-h-0">
              <div className="flex-1 overflow-y-auto p-4 min-h-0">
                <div className="flex items-center gap-2 mb-4">
                  <span className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground">视图</span>
                  <div className="inline-flex rounded-sm border border-border p-0.5">
                    <button
                      className={`px-3 py-1 text-[11px] font-mono rounded-sm transition-colors ${
                        structureView === 'tree' ? 'bg-accent/10 text-accent' : 'text-muted-foreground hover:text-foreground'
                      }`}
                      onClick={() => setStructureView('tree')}
                    >
                      树形
                    </button>
                    <button
                      className={`px-3 py-1 text-[11px] font-mono rounded-sm transition-colors ${
                        structureView === 'graph' ? 'bg-accent/10 text-accent' : 'text-muted-foreground hover:text-foreground'
                      }`}
                      onClick={() => setStructureView('graph')}
                    >
                      图形
                    </button>
                  </div>
                </div>
                {structureView === 'tree' ? (
                  <OrgTreeView
                    departments={depts}
                    selectedRole={selectedRole}
                    onRoleSelect={handleRoleSelect}
                    onAddRole={handleAddRole}
                  />
                ) : (
                  <OrgCanvasView
                    departments={depts}
                    selectedRole={selectedRole}
                    onRoleSelect={handleRoleSelect}
                  />
                )}
              </div>
              <aside className="w-[340px] border-l border-border shrink-0 overflow-y-auto bg-card chrome-hairline">
                <RoleEditor
                  selectedRole={selectedRole}
                  departments={depts}
                  onUpdate={handleRoleUpdate}
                />
              </aside>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full gap-4 p-8 text-center">
              <p className="font-display text-base font-medium">当前为工作流草稿</p>
              <p className="text-[12.5px] text-muted-foreground max-w-[48ch]">
                仅工作流模式下尚未绑定组织。可切换到「工作流」编辑画布，或新建组织后应用剧本。
              </p>
              <Button size="sm" variant="accent" onClick={() => setEditorTab('workflow')}>
                打开工作流
              </Button>
            </div>
          )
        )}

        {effectiveTab === 'workflow' && (
          <div className="flex h-full min-h-0">
            <div className="flex-1 flex flex-col min-h-0 min-w-0">
              <WorkflowToolbar orgId={orgId} />
              <div className="flex-1 min-h-0 relative">
                <WorkflowCanvas
                  onNodeClick={(node) => useWorkflowStore.getState().setSelectedNode(node)}
                />
             </div>
           </div>
            <aside className="w-72 border-l border-border shrink-0 overflow-y-auto min-h-0">
              <PropertiesPanel />
           </aside>
         </div>
        )}

        {effectiveTab === 'skills' && (
          <div className="p-4 overflow-y-auto h-full">
            <div className="flex items-center gap-2 mb-4">
              <Cpu size={16} className="text-accent" />
              <h3 className="font-display text-base font-medium tracking-[-0.01em]">组织技能绑定</h3>
            </div>
            <p className="text-[12.5px] text-muted-foreground mb-4 max-w-[60ch]">
              当前组织角色引用的技能及其在全局技能池中的可用性。
            </p>
            {depts.length === 0 ? (
              <div className="text-[12.5px] text-muted-foreground font-mono">
                {isDraftWorkflow ? '工作流草稿尚未绑定组织角色。' : '暂无角色。'}
              </div>
            ) : (
              <div className="space-y-2">
                {depts.flatMap((d: any) => d.roles || []).map((role: any, i: number) => (
                  <div key={i} className="flex items-center gap-3 p-3 rounded-sm border border-border">
                    <span className="font-mono text-[12px] text-foreground min-w-[120px]">{role.name}</span>
                    <Badge variant={role.bound_skill ? 'accent' : 'muted'} className="text-[10px]">
                      {role.bound_skill || '未绑定技能'}
                    </Badge>
                    <span className="font-mono text-[11px] text-muted-foreground">{role.agentType}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {effectiveTab === 'validation' && (
          <div className="h-full overflow-y-auto">
            <ValidationPanel orgId={orgId!} depts={depts} currentOrg={currentOrg} />
          </div>
        )}

        {effectiveTab === 'run' && (
          <div className="h-full overflow-y-auto">
            {currentOrg ? (
              <RunPanel orgId={orgId!} currentOrg={currentOrg} setRunDialogOpen={setRunDialogOpen} />
            ) : (
              <div className="flex flex-col items-center justify-center h-full gap-3 p-8 text-center">
                <p className="font-display text-base font-medium">需要绑定组织后才能运行</p>
                <p className="text-[12.5px] text-muted-foreground max-w-[48ch]">
                  当前为工作流草稿。请先新建或选择组织，再启动运行。
                </p>
              </div>
            )}
          </div>
        )}
     {effectiveTab === 'evolution' && (
          <div className="h-full overflow-y-auto">
            <EvolutionPanel />
          </div>
        )}
     </div>
   </div>
  );
}