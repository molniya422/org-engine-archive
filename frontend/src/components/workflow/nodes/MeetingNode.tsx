import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Users } from 'lucide-react';
import type { MeetingNodeData } from '../types';
import NodeDeleteButton from './NodeDeleteButton';

const MEETING_TYPE_LABEL: Record<MeetingNodeData['meetingType'], string> = {
  dept_internal: '部门内',
  ministerial: '部长级',
  decision: '决策',
};

/** 会议节点：类型徽标 + 参与者来源 + 议程。 */
function MeetingNode({ data, selected, id }: NodeProps<MeetingNodeData>) {
  return (
    <div
      className={`group relative px-4 py-3 rounded-md border-2 bg-card min-w-[160px] ${
        selected ? 'border-violet-500 ring-1 ring-violet-500/30' : 'border-violet-400/60'
      }`}
    >
      {id && <NodeDeleteButton nodeId={id} />}
      <Handle type="target" position={Position.Top} className="w-2.5 h-2.5 !bg-violet-500 border-2 border-background" />
      <div className="flex items-center gap-2 mb-2">
        <Users size={14} className="text-violet-500" />
        <span className="font-display text-[13px] font-medium">{MEETING_TYPE_LABEL[data.meetingType]}</span>
      </div>
      <div className="text-[11px] text-muted-foreground truncate max-w-[150px] font-mono">
        {data.agenda?.slice(0, 40) || '未设置议程'}
      </div>
      <div className="text-[10px] text-muted-foreground mt-1">
        参与者 {data.participants?.from ?? 'managers'}
      </div>
      <Handle type="source" position={Position.Bottom} className="w-2.5 h-2.5 !bg-violet-500 border-2 border-background" />
    </div>
  );
}

export default memo(MeetingNode);
