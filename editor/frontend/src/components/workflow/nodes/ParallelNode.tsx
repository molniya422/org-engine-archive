import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Zap } from 'lucide-react';
import type { ParallelNodeData } from '../types';
import NodeDeleteButton from './NodeDeleteButton';

type Props = { data: ParallelNodeData; selected?: boolean; id?: string };

function ParallelNode({ data, selected, id }: Props) {
  const branchCount = data.branches?.length || 0;
  const strategy = data.mergeStrategy === 'all' ? '全部完成' : '任一完成';
  return (
    <div className={`group relative px-4 py-3 rounded-md border-2 bg-card min-w-[160px] ${selected ? 'border-accent ring-1 ring-accent/30' : 'border-border'}`}>
      {id && <NodeDeleteButton nodeId={id} />}
      <Handle type="target" position={Position.Top} className="w-2.5 h-2.5 !bg-accent border-2 border-background" />
      <div className="flex items-center gap-2 mb-2">
        <Zap size={14} className="text-accent" />
        <span className="font-display text-[13px] font-medium">并行</span>
      </div>
      <div className="text-[11px] text-muted-foreground font-mono">{branchCount} 个分支 · {strategy}</div>
      <Handle type="source" position={Position.Bottom} className="w-2.5 h-2.5 !bg-accent border-2 border-background" />
    </div>
  );
}

export default memo(ParallelNode);
