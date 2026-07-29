import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { ParallelNodeData } from '../types';

type Props = { data: ParallelNodeData; selected?: boolean };

function ParallelNode({ data, selected }: Props) {
  return (
    <div className={`px-4 py-3 rounded-lg border-2 shadow-sm bg-white dark:bg-gray-800 min-w-[160px] ${selected ? 'border-purple-500 ring-2 ring-purple-200' : 'border-gray-200 dark:border-gray-700'}`}>
      <Handle type="target" position={Position.Top} className="w-3 h-3 !bg-purple-500 border-2 border-white" />
      <div className="flex items-center gap-2 mb-2">
        <span className="text-lg">⚡</span>
        <span className="font-semibold text-sm text-gray-900 dark:text-gray-100">Parallel</span>
      </div>
      <div className="text-xs text-gray-500 dark:text-gray-400">{data.branches?.length || 0} branches · {data.mergeStrategy}</div>
      <Handle type="source" position={Position.Bottom} className="w-3 h-3 !bg-purple-500 border-2 border-white" />
    </div>
  );
}

export default memo(ParallelNode);
