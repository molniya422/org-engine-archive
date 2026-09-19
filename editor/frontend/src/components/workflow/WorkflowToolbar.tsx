import { useCallback, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useWorkflowStore } from '@/stores/workflow-store';
import { useOrgStore } from '@/stores/org-store';
import { toast } from '@/stores/toast-store';
import { api } from '@/api/client';
import { Separator } from '@/components/ui/separator';
import {
  User, Wrench, GitFork, Zap, Radio, Users, Undo2, Redo2, LayoutGrid, Check, Trash2, Save, Loader2,
} from 'lucide-react';

const nodeTypes = [
  { type: 'agent', label: '智能体', icon: User },
  { type: 'skill', label: '技能', icon: Wrench },
  { type: 'decision', label: '决策', icon: GitFork },
  { type: 'parallel', label: '并行', icon: Zap },
  { type: 'channel', label: '频道', icon: Radio },
  { type: 'meeting', label: '会议', icon: Users },
];

export function WorkflowToolbar({ orgId }: { orgId?: string }) {
  const { nodes, selectedNode, clearWorkflow, undo, redo, canUndo, canRedo, autoLayout, validateWorkflow, removeNodeById, generateFromOrg, edgeKind, setEdgeKind } = useWorkflowStore();
  const currentOrg = useOrgStore((s) => s.currentOrg);
  const [validationErrors, setValidationErrors] = useState<string[] | null>(null);
  const [saving, setSaving] = useState(false);

  const onDragStart = useCallback((event: React.DragEvent, nodeType: string) => {
    event.dataTransfer.setData('application/reactflow', nodeType);
    event.dataTransfer.effectAllowed = 'move';
  }, []);

  // Persist the workflow to the org record so it survives app restarts.
  // Falls back to a JSON download for unbound drafts (no orgId yet).
  const handleSave = useCallback(async () => {
    const { nodes, edges } = useWorkflowStore.getState();
    const workflow = { version: '2.0', nodes, edges, triggers: ['manual'] };

    // Draft mode: no org to attach to → keep the file-download escape hatch
    if (!orgId || orgId === 'new' || orgId === 'draft') {
      const blob = new Blob([JSON.stringify(workflow, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'workflow.json';
      a.click();
      URL.revokeObjectURL(url);
      toast.info('草稿工作流已导出为 workflow.json');
      return;
    }

    if (!currentOrg) {
      toast.error('尚未加载组织数据，无法保存工作流');
      return;
    }

    setSaving(true);
    try {
      const payload = { ...currentOrg, workflow };
      await api.saveOrg(orgId, payload);
      toast.success('工作流已保存');
    } catch (e: any) {
      toast.error(e?.message ?? '保存工作流失败');
    } finally {
      setSaving(false);
    }
  }, [orgId, currentOrg]);

  const handleValidate = useCallback(() => {
    const errors = validateWorkflow();
    setValidationErrors(errors);
  }, [validateWorkflow]);

  return (
    <>
      <div className="flex items-center gap-2 p-3 border-b border-border bg-card shrink-0">
        <span className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground mr-2">节点</span>
        {nodeTypes.map((nt) => {
          const Icon = nt.icon;
          return (
            <div
              key={nt.type}
              draggable
              onDragStart={(e) => onDragStart(e, nt.type)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-sm border border-border bg-background cursor-grab active:cursor-grabbing hover:border-accent/40 transition-colors text-[12px] select-none"
            >
              <Icon size={13} className="text-muted-foreground" />
              <span>{nt.label}</span>
           </div>
          );
        })}
        <Separator orientation="vertical" className="h-6 mx-2" />
        <span className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground">连接</span>
        <select
          className="h-7 rounded-sm border border-input bg-background px-2 text-[12px] cursor-pointer"
          value={edgeKind}
          onChange={(e) => setEdgeKind(e.target.value as 'flow' | 'message')}
          title="选择要创建的连接类型：流程边 / 消息边"
        >
          <option value="flow">流程边</option>
          <option value="message">消息边</option>
        </select>
        <Separator orientation="vertical" className="h-6 mx-2" />
        <Button variant="ghost" size="sm" onClick={undo} disabled={!canUndo()} title="撤销 (Ctrl+Z)">
          <Undo2 size={13} />
       </Button>
        <Button variant="ghost" size="sm" onClick={redo} disabled={!canRedo()} title="重做 (Ctrl+Y)">
          <Redo2 size={13} />
       </Button>
        <Separator orientation="vertical" className="h-6 mx-2" />
        <Button variant="outline" size="sm" onClick={autoLayout} disabled={nodes.length === 0} title="自动布局">
          <LayoutGrid size={13} /> 布局
       </Button>
        <Button variant="outline" size="sm" onClick={handleValidate} disabled={nodes.length === 0} title="校验工作流">
          <Check size={13} /> 校验
       </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => { if (selectedNode) removeNodeById(selectedNode.id); }}
          disabled={!selectedNode}
          title="删除当前选中的节点 (Backspace)"
        >
          <Trash2 size={13} /> 删节点
       </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => generateFromOrg(currentOrg?.org?.departments ?? [])}
          disabled={!currentOrg?.org?.departments?.length}
          title="从组织部门/角色生成工作流"
        >
          <GitFork size={13} /> 从组织生成
       </Button>
        <Button variant="ghost" size="sm" onClick={clearWorkflow} disabled={nodes.length === 0} title="清空全部节点">
          清空
       </Button>
        <Button variant="default" size="sm" onClick={handleSave} disabled={nodes.length === 0 || saving}>
          {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} {saving ? '保存中' : '保存'}
       </Button>
     </div>

      {/* Validation dialog */}
      <Dialog open={validationErrors !== null} onOpenChange={(open) => { if (!open) setValidationErrors(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>工作流校验</DialogTitle>
            <DialogDescription>
              {validationErrors && validationErrors.length > 0 ? (
                <ul className="list-disc pl-4 space-y-1">
                  {validationErrors.map((e, i) => (
                    <li key={i} className="text-destructive">{e}</li>
                  ))}
               </ul>
              ) : (
                <p className="text-emerald-400">校验通过，未发现问题。</p>
              )}
           </DialogDescription>
         </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="default">确认</Button>
           </DialogClose>
         </DialogFooter>
       </DialogContent>
     </Dialog>
    </>
  );
}