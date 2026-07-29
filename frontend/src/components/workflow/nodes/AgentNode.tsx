import { memo } from 'react';
import { Handle, Position, type Node } from '@xyflow/react';
import type { AgentNodeData } from '../types';

type Props = { data: AgentNodeData; selected?: boolean };

function AgentNode({ data, selected }: Props) {
  return (
    <div
      className={`px-4 py-3 rounded-lg border-2 shadow-sm bg-white dark:bg-gray-800 min-w-[180px] ${
        selected ? 'border-blue-500 ring-2 ring-blue-200' : 'border-gray-200 dark:border-gray-700'
      }`}
    >
      <Handle type="target" position={Position.Top} className="w-3 h-3 !bg-blue-500 border-2 border-white" />
      <div className="flex items-center gap-2 mb-2">
        <span className="text-lg">👤</span>
        <span className="font-semibold text-sm text-gray-900 dark:text-gray-100">{data.role || 'Agent'}</span>
      </div>
      <div className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-[160px]">
        {data.goal?.slice(0, 60) || 'No goal set'}
      </div>
      <div className="flex gap-1 mt-2 flex-wrap">
        {data.skills?.slice(0, 3).map((s: string) => (
          <span key={s} className="px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded text-[10px]">{s}</span>
        ))}
      </div>
      <Handle type="source" position={Position.Bottom} className="w-3 h-3 !bg-blue-500 border-2 border-white" />
    </div>
  );
}

export default memo(AgentNode);
