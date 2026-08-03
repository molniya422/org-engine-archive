import { memo } from 'react';
import { X } from 'lucide-react';
import { useWorkflowStore } from '@/stores/workflow-store';

/**
 * Per-node delete button shown on hover.
 * Directly removes the node (and its edges) without requiring
 * the node to be selected first — fixes the "只能全部清空" UX gap
 * where single-node deletion was hidden behind selection.
 */
function NodeDeleteButton({ nodeId }: { nodeId: string }) {
  return (
    <button
      type="button"
      title="删除此节点"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        useWorkflowStore.getState().removeNodeById(nodeId);
      }}
      className="nodrag absolute -top-2 -right-2 z-10 flex h-5 w-5 items-center justify-center rounded-full border border-border bg-background text-muted-foreground opacity-0 shadow-sm transition-opacity group-hover:opacity-100 hover:text-destructive hover:border-destructive/40"
    >
      <X size={11} strokeWidth={2.5} />
    </button>
  );
}

export default memo(NodeDeleteButton);
