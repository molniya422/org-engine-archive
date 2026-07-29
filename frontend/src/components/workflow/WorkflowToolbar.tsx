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
import { useWorkflowStore } from '@/stores/workflow-store';
import { Separator } from '@/components/ui/separator';

const nodeTypes = [
  { type: 'agent', label: 'Agent', icon: '👤' },
  { type: 'skill', label: 'Skill', icon: '🔧' },
  { type: 'decision', label: 'Decision', icon: '🔀' },
  { type: 'parallel', label: 'Parallel', icon: '⚡' },
];

export function WorkflowToolbar() {
  const { nodes, clearWorkflow, undo, redo, canUndo, canRedo, autoLayout, validateWorkflow } = useWorkflowStore();
  const [validationErrors, setValidationErrors] = useState<string[] | null>(null);

  const onDragStart = useCallback((event: React.DragEvent, nodeType: string) => {
    event.dataTransfer.setData('application/reactflow', nodeType);
    event.dataTransfer.effectAllowed = 'move';
  }, []);

  const handleSave = useCallback(() => {
    const { nodes, edges } = useWorkflowStore.getState();
    const workflow = { version: '2.0', nodes, edges, triggers: ['manual'] };
    const blob = new Blob([JSON.stringify(workflow, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'workflow.json';
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const handleValidate = useCallback(() => {
    const errors = validateWorkflow();
    setValidationErrors(errors);
  }, [validateWorkflow]);

  return (
    <>
      <div className="flex items-center gap-2 p-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400 mr-2">Nodes</span>
        {nodeTypes.map((nt) => (
          <div
            key={nt.type}
            draggable
            onDragStart={(e) => onDragStart(e, nt.type)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 cursor-grab active:cursor-grabbing hover:bg-gray-100 dark:hover:bg-gray-700 text-xs select-none"
          >
            <span>{nt.icon}</span>
            <span>{nt.label}</span>
          </div>
        ))}
        <Separator orientation="vertical" className="h-6 mx-2" />
        <Button variant="ghost" size="sm" onClick={undo} disabled={!canUndo()} title="Undo (Ctrl+Z)">
          ↩
        </Button>
        <Button variant="ghost" size="sm" onClick={redo} disabled={!canRedo()} title="Redo (Ctrl+Y)">
          ↪
        </Button>
        <Separator orientation="vertical" className="h-6 mx-2" />
        <Button variant="outline" size="sm" onClick={autoLayout} disabled={nodes.length === 0} title="Auto-layout">
          ⊞ Layout
        </Button>
        <Button variant="outline" size="sm" onClick={handleValidate} disabled={nodes.length === 0} title="Validate workflow">
          ✓ Validate
        </Button>
        <Button variant="outline" size="sm" onClick={clearWorkflow} disabled={nodes.length === 0}>
          Clear
        </Button>
        <Button variant="default" size="sm" onClick={handleSave} disabled={nodes.length === 0}>
          Save
        </Button>
      </div>

      {/* Validation dialog */}
      <Dialog open={validationErrors !== null} onOpenChange={(open) => { if (!open) setValidationErrors(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Workflow Validation</DialogTitle>
            <DialogDescription>
              {validationErrors && validationErrors.length > 0 ? (
                <ul className="list-disc pl-4 space-y-1">
                  {validationErrors.map((e, i) => (
                    <li key={i} className="text-destructive">{e}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-green-600 dark:text-green-400">All checks passed! ✓</p>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="default">OK</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
