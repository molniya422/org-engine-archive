import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Wrench } from 'lucide-react';
import type { SkillNodeData } from '../types';
import NodeDeleteButton from './NodeDeleteButton';

type Props = { data: SkillNodeData; selected?: boolean; id?: string };

function SkillNode({ data, selected, id }: Props) {
  return (
    <div className={`group relative px-4 py-3 rounded-md border-2 bg-card min-w-[160px] ${selected ? 'border-accent ring-1 ring-accent/30' : 'border-border'}`}>
      {id && <NodeDeleteButton nodeId={id} />}
      <Handle type="target" position={Position.Top} className="w-2.5 h-2.5 !bg-accent border-2 border-background" />
      <div className="flex items-center gap-2 mb-2">
        <Wrench size={14} className="text-accent" />
        <span className="font-display text-[13px] font-medium">{data.skillId || '技能'}</span>
      </div>
      <div className="text-[11px] text-muted-foreground font-mono">{data.timeout ? `超时：${data.timeout}秒` : ''}</div>
      <Handle type="source" position={Position.Bottom} className="w-2.5 h-2.5 !bg-accent border-2 border-background" />
    </div>
  );
}

export default memo(SkillNode);
