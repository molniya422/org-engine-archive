import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Radio } from 'lucide-react';
import type { ChannelNodeData } from '../types';
import NodeDeleteButton from './NodeDeleteButton';

type Props = { data: ChannelNodeData; selected?: boolean; id?: string };

/** 共享通信频道节点：读写 ACL 数量展示。虚线边框区分流程节点。 */
function ChannelNode({ data, selected, id }: Props) {
  return (
    <div
      className={`group relative px-4 py-3 rounded-md border-2 border-dashed bg-card min-w-[160px] ${
        selected ? 'border-sky-500 ring-1 ring-sky-500/30' : 'border-sky-400/50'
      }`}
    >
      {id && <NodeDeleteButton nodeId={id} />}
      <Handle type="target" position={Position.Top} className="w-2.5 h-2.5 !bg-sky-500 border-2 border-background" />
      <div className="flex items-center gap-2 mb-2">
        <Radio size={14} className="text-sky-500" />
        <span className="font-display text-[13px] font-medium truncate max-w-[120px]">{data.channelKey}</span>
      </div>
      <div className="text-[11px] text-muted-foreground font-mono">
        R:{data.acl.read.length} · W:{data.acl.write.length}
      </div>
      <Handle type="source" position={Position.Bottom} className="w-2.5 h-2.5 !bg-sky-500 border-2 border-background" />
    </div>
  );
}

export default memo(ChannelNode);
