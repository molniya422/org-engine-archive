import { useCallback, useEffect, useMemo, useRef, type DragEvent } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  BackgroundVariant,
  type Node,
  type NodeTypes,
  type OnNodesDelete,
  ReactFlowProvider,
  useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import AgentNode from './nodes/AgentNode';
import SkillNode from './nodes/SkillNode';
import DecisionNode from './nodes/DecisionNode';
import ParallelNode from './nodes/ParallelNode';
import ChannelNode from './nodes/ChannelNode';
import MeetingNode from './nodes/MeetingNode';
import { useWorkflowStore } from '@/stores/workflow-store';
import type { WorkflowNodeData } from './types';

const nodeTypes: NodeTypes = {
  agent: AgentNode,
  skill: SkillNode,
  decision: DecisionNode,
  parallel: ParallelNode,
  channel: ChannelNode,
  meeting: MeetingNode,
};

interface WorkflowCanvasProps {
  onNodeClick?: (node: Node<WorkflowNodeData>) => void;
  readOnly?: boolean;
}

function CanvasInner({ onNodeClick, readOnly }: WorkflowCanvasProps) {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition, fitView } = useReactFlow();
  const { nodes, edges, onNodesChange, onEdgesChange, onConnect, addNode, removeNodeById, activeNodeIds, activeMessageEdges } = useWorkflowStore();

  // 运行高亮：活跃节点加 emerald ring，活跃消息边点亮为动画绿色
  const displayNodes = useMemo(
    () =>
      nodes.map((n) =>
        activeNodeIds.includes(n.id)
          ? { ...n, className: `${n.className ?? ''} ring-2 ring-emerald-400`.trim() }
          : n,
      ),
    [nodes, activeNodeIds],
  );
  const displayEdges = useMemo(
    () =>
      edges.map((e) =>
        activeMessageEdges.includes(e.id)
          ? { ...e, animated: true, style: { ...(e.style ?? {}), stroke: '#10b981' } }
          : e,
      ),
    [edges, activeMessageEdges],
  );

  // When nodes are loaded (e.g. playbook apply), fit them into the visible viewport
  useEffect(() => {
    if (nodes.length === 0) return;
    const t = window.setTimeout(() => {
      try {
        fitView({ padding: 0.2, duration: 200 });
      } catch {
        /* ignore */
      }
    }, 50);
    return () => window.clearTimeout(t);
  }, [nodes.length, edges.length, fitView]);

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

  const handleNodesDelete = useCallback<OnNodesDelete>(
    (deleted) => {
      for (const n of deleted) {
        removeNodeById(n.id);
      }
    },
    [removeNodeById],
  );

  return (
    <div
      ref={reactFlowWrapper}
      className="absolute inset-0 w-full h-full min-h-[320px]"
      data-testid="workflow-canvas"
    >
      <ReactFlow
        nodes={displayNodes}
        edges={displayEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onNodeClick={(_, node) => onNodeClick?.(node as Node<WorkflowNodeData>)}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        proOptions={{ hideAttribution: true }}
        deleteKeyCode={readOnly ? undefined : ['Backspace', 'Delete']}
        multiSelectionKeyCode="Shift"
        selectionKeyCode="Shift"
        snapToGrid
        snapGrid={[20, 20]}
        nodesDraggable={!readOnly}
        nodesConnectable={!readOnly}
        elementsSelectable
        defaultEdgeOptions={{ animated: true, style: { stroke: '#94a3b8', strokeWidth: 2 } }}
        style={{ width: '100%', height: '100%' }}
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
      {nodes.length === 0 && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center z-10">
          <div className="text-center max-w-sm px-4">
            <p className="font-display text-sm font-medium text-foreground mb-1">工作流画布为空</p>
            <p className="text-[12px] text-muted-foreground leading-relaxed">
              从上方拖入节点，或在「编排剧本」中应用一个剧本以生成流水线。
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export function WorkflowCanvas(props: WorkflowCanvasProps) {
  return (
    <div className="w-full h-full min-h-[320px] relative">
      <ReactFlowProvider>
        <CanvasInner {...props} />
      </ReactFlowProvider>
    </div>
  );
}
