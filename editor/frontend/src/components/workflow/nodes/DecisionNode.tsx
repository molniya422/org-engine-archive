import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { GitFork } from 'lucide-react';
import type { DecisionNodeData } from '../types';
import NodeDeleteButton from './NodeDeleteButton';

type Props = { data: DecisionNodeData; selected?: boolean; id?: string };

function DecisionNode({ data, selected, id }: Props) {
  return (
    <div className={`group relative px-4 py-3 rounded-md border-2 bg-card min-w-[160px] ${selected ? 'border-accent ring-1 ring-accent/30' : 'border-border'}`}>
      {id && <NodeDeleteButton nodeId={id} />}
      <Handle type="target" position={Position.Top} className="w-2.5 h-2.5 !bg-accent border-2 border-background" />
      <div className="flex items-center gap-2 mb-2">
        <GitFork size={14} className="text-accent" />
        <span className="font-display text-[13px] font-medium">决策</span>
      </div>
      <div className="text-[11px] text-muted-foreground font-mono truncate">{data.condition || '条件'}</div>
      <Handle type="source" position={Position.Bottom} id="true" className="w-2.5 h-2.5 !bg-emerald-500 border-2 border-background" />
      <Handle type="source" position={Position.Right} id="false" className="w-2.5 h-2.5 !bg-destructive border-2 border-background" />
    </div>
  );
}

export default memo(DecisionNode);
