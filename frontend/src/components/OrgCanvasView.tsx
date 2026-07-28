import { useMemo, useCallback } from 'react';
import {
  ReactFlow,
  Node,
  Edge,
  Controls,
  Background,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  NodeProps,
  Handle,
  Position,
  MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import styles from './OrgCanvasView.module.css';

interface Department { name: string; roles: { name: string; agentType: string; bound_skill: string }[] }

interface OrgCanvasViewProps { departments: Department[] }

function DeptNode({ data }: NodeProps) {
  return (
    <div className={styles.deptNode}>
      <Handle type="source" position={Position.Bottom} />
      <div className={styles.deptLabel}>{data.label as string}</div>
    </div>
  );
}

function RoleNode({ data }: NodeProps) {
  return (
    <div className={styles.roleNode}>
      <Handle type="target" position={Position.Top} />
      <div className={styles.roleName}>{data.label as string}</div>
      <div className={styles.roleType}>{data.agentType as string}</div>
    </div>
  );
}

const nodeTypes = { dept: DeptNode, role: RoleNode };

export function OrgCanvasView({ departments }: OrgCanvasViewProps) {
  const initialNodes: Node[] = useMemo(() => {
    const nodes: Node[] = [];
    const spacing = { x: 250, y: 120 };

    departments.forEach((dept, deptIdx) => {
      const cx = deptIdx * spacing.x + 100;
      const cy = 60;
      nodes.push({
        id: `dept-${deptIdx}`,
        type: 'dept',
        position: { x: cx, y: cy },
        data: { label: dept.name },
      });

      dept.roles.forEach((role, roleIdx) => {
        nodes.push({
          id: `role-${deptIdx}-${roleIdx}`,
          type: 'role',
          position: { x: cx - 80 + roleIdx * 80, y: cy + spacing.y },
          data: { label: role.name, agentType: role.agentType },
        });
      });
    });

    return nodes;
  }, [departments]);

  const initialEdges: Edge[] = useMemo(() => {
    const edges: Edge[] = [];
    departments.forEach((dept, deptIdx) => {
      dept.roles.forEach((_, roleIdx) => {
        edges.push({
          id: `e-${deptIdx}-${roleIdx}`,
          source: `dept-${deptIdx}`,
          target: `role-${deptIdx}-${roleIdx}`,
          type: 'smoothstep',
          markerEnd: { type: MarkerType.ArrowClosed },
          style: { stroke: '#D1D5DB', strokeWidth: 2 },
        });
      });
    });
    return edges;
  }, [departments]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Sync when departments change (new dept/role added externally)
  // This is a simplification — full drag-to-reorder is in Tree View
  // and the Canvas is primarily a visualization.

  return (
    <div className={styles.canvas}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
        attributionPosition="bottom-right"
      >
        <Controls />
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#E2E0DA" />
      </ReactFlow>
    </div>
  );
}
