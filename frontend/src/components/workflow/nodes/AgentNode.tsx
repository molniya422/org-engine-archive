import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { User, Building2 } from 'lucide-react';
import type { AgentNodeData, OrgRef } from '../types';
import NodeDeleteButton from './NodeDeleteButton';

type Props = { data: AgentNodeData; selected?: boolean; id?: string };

function AgentNode({ data, selected, id }: Props) {
  const orgRef = data.orgRef as OrgRef | undefined;
  return (
    <div
      className={`group relative px-4 py-3 rounded-md border-2 bg-card min-w-[180px] ${
        selected
          ? 'border-accent ring-1 ring-accent/30'
          : 'border-border'
      }`}
    >
      {id && <NodeDeleteButton nodeId={id} />}
      <Handle type="target" position={Position.Top} className="w-2.5 h-2.5 !bg-accent border-2 border-background" />
      <div className="flex items-center gap-2 mb-2">
        <User size={14} className="text-accent" />
        <span className="font-display text-[13px] font-medium">{data.role || '智能体'}</span>
        {orgRef && (
          <span className="flex items-center gap-0.5 rounded-sm bg-muted px-1 py-0.5 text-[9px] font-mono text-muted-foreground" title={orgRef.kind === 'role' ? `组织角色 D${orgRef.deptIdx + 1}R${(orgRef.roleIdx ?? 0) + 1}` : `组织部门 D${orgRef.deptIdx + 1}`}>
            <Building2 size={9} /> {orgRef.kind === 'role' ? `D${orgRef.deptIdx + 1}R${(orgRef.roleIdx ?? 0) + 1}` : `D${orgRef.deptIdx + 1}`}
          </span>
        )}
      </div>
      <div className="text-[11px] text-muted-foreground truncate max-w-[160px] font-mono">
        {data.goal?.slice(0, 60) || '未设置目标'}
      </div>
      <div className="flex gap-1 mt-2 flex-wrap">
        {data.skills?.slice(0, 3).map((s: string) => (
          <span key={s} className="px-1.5 py-0.5 bg-accent/10 text-accent rounded-sm text-[10px] font-mono">{s}</span>
        ))}
      </div>
      <Handle type="source" position={Position.Bottom} className="w-2.5 h-2.5 !bg-accent border-2 border-background" />
    </div>
  );
}

export default memo(AgentNode);
