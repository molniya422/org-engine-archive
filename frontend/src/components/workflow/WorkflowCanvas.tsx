import { useCallback, useRef, type DragEvent } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  BackgroundVariant,
  type Node,
  type NodeTypes,
  ReactFlowProvider,
  useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import AgentNode from './nodes/AgentNode';
import SkillNode from './nodes/SkillNode';
import DecisionNode from './nodes/DecisionNode';
import ParallelNode from './nodes/ParallelNode';
import { useWorkflowStore } from '@/stores/workflow-store';
import type { WorkflowNodeData } from './types';

const nodeTypes: NodeTypes = {
  agent: AgentNode,
  skill: SkillNode,
  decision: DecisionNode,
  parallel: ParallelNode,
};

interface WorkflowCanvasProps {
  onNodeClick?: (node: Node<WorkflowNodeData>) => void;
  readOnly?: boolean;
}

function CanvasInner({ onNodeClick, readOnly }: WorkflowCanvasProps) {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition } = useReactFlow();
  const { nodes, edges, onNodesChange, onEdgesChange, onConnect, addNode } = useWorkflowStore();

  const onDrop = useCallback(
    (event: DragEvent) => {
      event.preventDefault();
      const type = event.dataTransfer.getData('application/reactflow');
      if (!type || !reactFlowWrapper.current) return;
      const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      addNode(type, position);
    },
    [screenToFlowPosition, addNode],
  );

  const onDragOver = useCallback((event: DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  return (
    <div ref={reactFlowWrapper} className="w-full h-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onNodeClick={(_, node) => onNodeClick?.(node as Node<WorkflowNodeData>)}
        nodeTypes={nodeTypes}
        fitView
        deleteKeyCode={readOnly ? undefined : 'Backspace'}
        snapToGrid
        snapGrid={[20, 20]}
        nodesDraggable={!readOnly}
        nodesConnectable={!readOnly}
        elementsSelectable
        defaultEdgeOptions={{ animated: true, style: { stroke: '#94a3b8', strokeWidth: 2 } }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#e2e8f0" />
        <Controls
          className="!shadow-lg !rounded-lg !border !border-gray-200 dark:!border-gray-700"
          showInteractive={false}
        />
        <MiniMap
          nodeStrokeWidth={3}
          pannable
          zoomable
          className="!bottom-4 !left-4 !shadow-lg !rounded-lg !border !border-gray-200 dark:!border-gray-700"
          nodeColor={(n) => {
            switch (n.type) {
              case 'agent': return '#3b82f6';
              case 'skill': return '#22c55e';
              case 'decision': return '#f59e0b';
              case 'parallel': return '#a855f7';
              default: return '#94a3b8';
            }
          }}
        />
      </ReactFlow>
    </div>
  );
}

export function WorkflowCanvas(props: WorkflowCanvasProps) {
  return (
    <ReactFlowProvider>
      <CanvasInner {...props} />
    </ReactFlowProvider>
  );
}
