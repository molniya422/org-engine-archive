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
  NodeMouseHandler,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from 'dagre';
import styles from './OrgCanvasView.module.css';

interface Department { name: string; roles: { name: string; agentType: string; bound_skill: string }[] }

interface OrgCanvasViewProps {
  departments: Department[];
  selectedRole: { deptIdx: number; roleIdx: number } | null;
  onRoleSelect: (deptIdx: number, roleIdx: number) => void;
}

const NODE_WIDTH = 180;
const NODE_HEIGHT = 50;
const ROLE_NODE_HEIGHT = 44;

function DeptNode({ data }: NodeProps) {
  return (
    <div className={styles.deptNode} style={{ width: NODE_WIDTH }}>
      <Handle type="source" position={Position.Bottom} />
      <div className={styles.deptLabel}>{data.label as string}</div>
    </div>
  );
}

function RoleNode({ data }: NodeProps) {
  return (
    <div
      className={`${styles.roleNode} ${data.isSelected ? styles.roleSelected : ''}`}
      style={{ width: NODE_WIDTH }}
    >
      <Handle type="target" position={Position.Top} />
      <div className={styles.roleName}>{data.label as string}</div>
      <div className={styles.roleType}>{data.agentType as string}</div>
    </div>
  );
}

const nodeTypes = { dept: DeptNode, role: RoleNode };

function buildGraph(
  departments: Department[],
  selectedRole: { deptIdx: number; roleIdx: number } | null,
): { nodes: Node[]; edges: Edge[] } {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'TB', nodesep: 40, ranksep: 60, marginx: 40, marginy: 40 });

  const nodes: Node[] = [];
  const edges: Edge[] = [];

  departments.forEach((dept, deptIdx) => {
    const deptId = `dept-${deptIdx}`;
    g.setNode(deptId, { width: NODE_WIDTH, height: NODE_HEIGHT });

    dept.roles.forEach((role, roleIdx) => {
      const roleId = `role-${deptIdx}-${roleIdx}`;
      g.setNode(roleId, { width: NODE_WIDTH, height: ROLE_NODE_HEIGHT });
      g.setEdge(deptId, roleId);
    });
  });

  dagre.layout(g);

  departments.forEach((dept, deptIdx) => {
    const deptId = `dept-${deptIdx}`;
    const deptPos = g.node(deptId);
    nodes.push({
      id: deptId,
      type: 'dept',
      position: { x: deptPos.x - NODE_WIDTH / 2, y: deptPos.y - NODE_HEIGHT / 2 },
      data: { label: dept.name },
    });

    dept.roles.forEach((role, roleIdx) => {
      const roleId = `role-${deptIdx}-${roleIdx}`;
      const rolePos = g.node(roleId);
      const isSelected =
        selectedRole?.deptIdx === deptIdx && selectedRole?.roleIdx === roleIdx;
      nodes.push({
        id: roleId,
        type: 'role',
        position: { x: rolePos.x - NODE_WIDTH / 2, y: rolePos.y - ROLE_NODE_HEIGHT / 2 },
        data: { label: role.name, agentType: role.agentType, deptIdx, roleIdx, isSelected },
      });
      edges.push({
        id: `e-${deptIdx}-${roleIdx}`,
        source: deptId,
        target: roleId,
        type: 'smoothstep',
        markerEnd: { type: MarkerType.ArrowClosed },
        style: { stroke: '#D1D5DB', strokeWidth: 2 },
      });
    });
  });

  return { nodes, edges };
}

export function OrgCanvasView({ departments, selectedRole, onRoleSelect }: OrgCanvasViewProps) {
  const { nodes: initialNodes, edges: initialEdges } = useMemo(
    () => buildGraph(departments, selectedRole),
    [departments, selectedRole],
  );

  const [nodes, _setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, _setEdges, onEdgesChange] = useEdgesState(initialEdges);

  const onNodeClick: NodeMouseHandler = useCallback((_event, node) => {
    const deptIdx = node.data.deptIdx as number | undefined;
    const roleIdx = node.data.roleIdx as number | undefined;
    if (deptIdx !== undefined && roleIdx !== undefined) {
      onRoleSelect(deptIdx, roleIdx);
    }
  }, [onRoleSelect]);

  return (
    <div className={styles.canvas}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
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
