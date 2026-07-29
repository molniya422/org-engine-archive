import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { DecisionNodeData } from '../types';

type Props = { data: DecisionNodeData; selected?: boolean };

function DecisionNode({ data, selected }: Props) {
  return (
    <div className={`px-4 py-3 rounded-lg border-2 shadow-sm bg-white dark:bg-gray-800 min-w-[160px] ${selected ? 'border-amber-500 ring-2 ring-amber-200' : 'border-gray-200 dark:border-gray-700'}`}>
      <Handle type="target" position={Position.Top} className="w-3 h-3 !bg-amber-500 border-2 border-white" />
      <div className="flex items-center gap-2 mb-2">
        <span className="text-lg">🔀</span>
        <span className="font-semibold text-sm text-gray-900 dark:text-gray-100">Decision</span>
      </div>
      <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{data.condition || 'condition'}</div>
      <Handle type="source" position={Position.Bottom} id="true" className="w-3 h-3 !bg-green-500 border-2 border-white" />
      <Handle type="source" position={Position.Right} id="false" className="w-3 h-3 !bg-red-500 border-2 border-white" />
    </div>
  );
}

export default memo(DecisionNode);
