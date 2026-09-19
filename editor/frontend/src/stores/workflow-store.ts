import { create } from 'zustand';
import {
  type Node,
  type Edge,
  type Connection,
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  type NodeChange,
  type EdgeChange,
} from '@xyflow/react';
import dagre from 'dagre';
import type { WorkflowNodeData } from '@/components/workflow/types';

interface HistoryEntry {
  nodes: Node<WorkflowNodeData>[];
  edges: Edge[];
}

interface WorkflowState {
  nodes: Node<WorkflowNodeData>[];
  edges: Edge[];
  selectedNode: Node<WorkflowNodeData> | null;
  templateId: string | null;
  // Undo/redo history
  past: HistoryEntry[];
  future: HistoryEntry[];
  // 运行时视觉状态（4.5 callback高亮当前执行的节点与消息边）
  activeNodeIds: string[];
  activeMessageEdges: string[];
  markNodeActive: (nodeId: string) => void;
  markNodeInactive: (nodeId: string) => void;
  markMessageActive: (edgeId: string) => void;
  markMessageInactive: (edgeId: string) => void;
  // Actions
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (connection: Connection) => void;
  edgeKind: 'flow' | 'message';
  setEdgeKind: (kind: 'flow' | 'message') => void;
  addNode: (type: string, position: { x: number; y: number }) => void;
  setSelectedNode: (node: Node<WorkflowNodeData> | null) => void;
  updateNodeData: (nodeId: string, data: Partial<WorkflowNodeData>) => void;
  removeNodeById: (nodeId: string) => void;
  loadWorkflow: (nodes: Node<WorkflowNodeData>[], edges: Edge[]) => void;
  clearWorkflow: () => void;
  // Undo/redo
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  // Tools
  autoLayout: () => void;
  generateFromOrg: (departments: { name: string; roles: { name: string }[] }[]) => void;
  validateWorkflow: () => string[];
}

function pushHistory(state: { nodes: Node<WorkflowNodeData>[]; edges: Edge[]; past: HistoryEntry[]; future: HistoryEntry[] }) {
  state.past = [...state.past, { nodes: JSON.parse(JSON.stringify(state.nodes)), edges: JSON.parse(JSON.stringify(state.edges)) }];
  if (state.past.length > 50) state.past.shift();
  state.future = [];
}

export const useWorkflowStore = create<WorkflowState>((set, get) => ({
  nodes: [],
  edges: [],
  selectedNode: null,
  templateId: null,
  past: [],
  future: [],
  activeNodeIds: [],
  activeMessageEdges: [],

  markNodeActive: (nodeId) => {
    set((s) =>
      s.activeNodeIds.includes(nodeId) ? s : { activeNodeIds: [...s.activeNodeIds, nodeId] },
    );
  },
  markNodeInactive: (nodeId) => {
    set((s) => ({ activeNodeIds: s.activeNodeIds.filter((id) => id !== nodeId) }));
  },
  markMessageActive: (edgeId) => {
    set((s) =>
      s.activeMessageEdges.includes(edgeId)
        ? s
        : { activeMessageEdges: [...s.activeMessageEdges, edgeId] },
    );
    // 3s 后自动清除高亮
    setTimeout(() => get().markMessageInactive(edgeId), 3000);
  },
  markMessageInactive: (edgeId) => {
    set((s) => ({ activeMessageEdges: s.activeMessageEdges.filter((e) => e !== edgeId) }));
  },

  onNodesChange: (changes) => {
    const state = get();
    const hasStructuralChange = changes.some(c => 'type' in c && (c.type === 'add' || c.type === 'remove'));
    const updated = applyNodeChanges(changes, state.nodes) as Node<WorkflowNodeData>[];
    if (hasStructuralChange) {
      const newState = { ...state, nodes: updated };
      const past = [...state.past, { nodes: JSON.parse(JSON.stringify(state.nodes)), edges: JSON.parse(JSON.stringify(state.edges)) }];
      if (past.length > 50) past.shift();
      set({ nodes: updated, past, future: [] });
    } else {
      set({ nodes: updated });
    }
  },

  onEdgesChange: (changes) => {
    const state = get();
    const hasStructuralChange = changes.some(c => 'type' in c && (c.type === 'add' || c.type === 'remove'));
    const updated = applyEdgeChanges(changes, state.edges);
    if (hasStructuralChange) {
      const past = [...state.past, { nodes: JSON.parse(JSON.stringify(state.nodes)), edges: JSON.parse(JSON.stringify(state.edges)) }];
      if (past.length > 50) past.shift();
      set({ edges: updated, past, future: [] });
    } else {
      set({ edges: updated });
    }
  },

  onConnect: (connection) => {
    const state = get();
    const edgeKind = state.edgeKind ?? 'flow';
    const past = [...state.past, { nodes: JSON.parse(JSON.stringify(state.nodes)), edges: JSON.parse(JSON.stringify(state.edges)) }];
    if (past.length > 50) past.shift();
    // flow 边动画，message 边静态虚线；边数据带 kind 供消息/样式区分
    const isMessage = edgeKind === 'message';
    set({ edges: addEdge({
      ...connection,
      animated: !isMessage,
      data: { kind: edgeKind },
      style: isMessage ? { strokeDasharray: '6 4' } : undefined,
    }, state.edges), past, future: [] });
  },

  edgeKind: 'flow',
  setEdgeKind: (kind) => set({ edgeKind: kind }),

  addNode: (type, position) => {
    const state = get();
    const id = `node_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    // stageKind 到 node type 的映射（以兼容后端 playbook 数据格式）
    const normalizedType = type === 'agent' || type === 'skill' || type === 'decision' || type === 'parallel' || type === 'channel' || type === 'meeting' ? type : 'agent';
    const baseData: WorkflowNodeData = (() => {
      switch (normalizedType) {
        case 'agent': return { type: 'agent' as const, role: '新智能体', goal: '填写目标', backstory: '', llm: 'default', skills: [] };
        case 'skill': return { type: 'skill' as const, skillId: 'web-search', params: {}, timeout: 60 };
        case 'decision': return { type: 'decision' as const, condition: 'true', branches: {} };
        case 'parallel': return { type: 'parallel' as const, branches: [], mergeStrategy: 'all' as const };
        case 'channel': return { type: 'channel' as const, channelKey: '新频道', acl: { read: [], write: [] } };
        case 'meeting': return { type: 'meeting' as const, meetingType: 'ministerial' as const, participants: { from: 'managers' as const, roles: [] }, agenda: '', output: { write_to: ['channel'] as const } };
        default: return { type: 'agent' as const, role: '新智能体', goal: '', backstory: '', llm: 'default', skills: [] };
      }
    })();
    // Cascade new nodes diagonally so they never stack on top of each other.
    // If the caller supplied an explicit position (drag-drop), keep it but nudge
    // slightly away from any node already occupying the same spot.
    let pos = position ?? { x: 60 + (state.nodes.length % 6) * 260, y: 60 + Math.floor(state.nodes.length / 6) * 140 };
    const occupied = state.nodes.some(
      (n) => Math.abs(n.position.x - pos.x) < 40 && Math.abs(n.position.y - pos.y) < 40,
    );
    if (occupied) {
      pos = { x: pos.x + 30, y: pos.y + 40 };
    }
    const newNode: Node = { id, type: normalizedType, position: pos, data: baseData };
    const past = [...state.past, { nodes: JSON.parse(JSON.stringify(state.nodes)), edges: JSON.parse(JSON.stringify(state.edges)) }];
    if (past.length > 50) past.shift();
    set({ nodes: [...state.nodes, newNode as Node<WorkflowNodeData>], past, future: [] });
  },

  setSelectedNode: (node) => set({ selectedNode: node }),

  updateNodeData: (nodeId, data) => {
    const state = get();
    const past = [...state.past, { nodes: JSON.parse(JSON.stringify(state.nodes)), edges: JSON.parse(JSON.stringify(state.edges)) }];
    if (past.length > 50) past.shift();
    const nodes = state.nodes.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, ...data } } : n));
    // Refresh selectedNode when it points at the node being edited, so the
    // properties panel always renders the latest values (previously a stale ref).
    const selectedNode = state.selectedNode?.id === nodeId ? (nodes.find((n) => n.id === nodeId) ?? null) : state.selectedNode;
    set({ nodes, selectedNode, past, future: [] });
  },

  removeNodeById: (nodeId) => {
    const state = get();
    if (!state.nodes.some((n) => n.id === nodeId)) return;
    const past = [...state.past, { nodes: JSON.parse(JSON.stringify(state.nodes)), edges: JSON.parse(JSON.stringify(state.edges)) }];
    if (past.length > 50) past.shift();
    set({
      nodes: state.nodes.filter((n) => n.id !== nodeId),
      edges: state.edges.filter((e) => e.source !== nodeId && e.target !== nodeId),
      selectedNode: state.selectedNode?.id === nodeId ? null : state.selectedNode,
      past,
      future: [],
    });
  },

  loadWorkflow: (nodes, edges) => {
    const state = get();
    const past = [...state.past, { nodes: JSON.parse(JSON.stringify(state.nodes)), edges: JSON.parse(JSON.stringify(state.edges)) }];
    if (past.length > 50) past.shift();
    // Normalize legacy / playbook node types so ReactFlow can render them
    const ALLOWED = new Set(['agent', 'skill', 'decision', 'parallel']);
    const normalized = (nodes || []).map((n, i) => {
      const rawType = (n as any)?.type;
      const dataType = (n as any)?.data?.type;
      const stageKind = (n as any)?.data?.stageKind || (n as any)?.data?.kind;
      let type = ALLOWED.has(rawType) ? rawType : ALLOWED.has(dataType) ? dataType : null;
      if (!type) {
        if (stageKind === 'validate' || stageKind === 'review') type = 'decision';
        else if (stageKind === 'transform' || stageKind === 'export') type = 'skill';
        else type = 'agent';
      }
      const data = { ...(n as any).data, type };
      return {
        ...n,
        id: (n as any).id || `node_${i}`,
        type,
        position: (n as any).position || { x: i * 260, y: 120 },
        data,
      } as Node<WorkflowNodeData>;
    });
    set({ nodes: normalized, edges: edges || [], selectedNode: null, past, future: [] });
  },

  clearWorkflow: () => {
    const state = get();
    const past = [...state.past, { nodes: JSON.parse(JSON.stringify(state.nodes)), edges: JSON.parse(JSON.stringify(state.edges)) }];
    if (past.length > 50) past.shift();
    set({ nodes: [], edges: [], selectedNode: null, past, future: [] });
  },

  undo: () => {
    const state = get();
    if (state.past.length === 0) return;
    const prev = state.past[state.past.length - 1];
    const future = [{ nodes: JSON.parse(JSON.stringify(state.nodes)), edges: JSON.parse(JSON.stringify(state.edges)) }, ...state.future];
    set({ nodes: prev.nodes, edges: prev.edges, past: state.past.slice(0, -1), future });
  },

  redo: () => {
    const state = get();
    if (state.future.length === 0) return;
    const next = state.future[0];
    const past = [...state.past, { nodes: JSON.parse(JSON.stringify(state.nodes)), edges: JSON.parse(JSON.stringify(state.edges)) }];
    set({ nodes: next.nodes, edges: next.edges, past, future: state.future.slice(1) });
  },

  canUndo: () => get().past.length > 0,
  canRedo: () => get().future.length > 0,

  autoLayout: () => {
    const { nodes, edges } = get();
    if (nodes.length === 0) return;

    // Split the graph into connected components so dagre doesn't stack
    // disconnected groups on top of each other.
    const adjacency = new Map<string, Set<string>>();
    nodes.forEach((n) => adjacency.set(n.id, new Set()));
    edges.forEach((e) => {
      adjacency.get(e.source)?.add(e.target);
      adjacency.get(e.target)?.add(e.source);
    });

    const visited = new Set<string>();
    const components: string[][] = [];
    nodes.forEach((n) => {
      if (visited.has(n.id)) return;
      const comp: string[] = [];
      const queue = [n.id];
      visited.add(n.id);
      while (queue.length) {
        const cur = queue.pop()!;
        comp.push(cur);
        (adjacency.get(cur) ?? []).forEach((nb) => {
          if (!visited.has(nb)) { visited.add(nb); queue.push(nb); }
        });
      }
      components.push(comp);
    });

    const GAP_X = 280;
    const GAP_Y = 400;
    const MAX_ROW_WIDTH = 1200;
    const laidOut: Node<WorkflowNodeData>[] = [];
    let rowOffset = 0;
    let xCursor = 0;

    components.forEach((comp) => {
      const g = new dagre.graphlib.Graph();
      g.setDefaultEdgeLabel(() => ({}));
      g.setGraph({ rankdir: 'TB', nodesep: 60, ranksep: 80 });
      comp.forEach((id) => g.setNode(id, { width: 180, height: 80 }));
      edges.forEach((e) => {
        if (comp.includes(e.source) && comp.includes(e.target)) g.setEdge(e.source, e.target);
      });
      dagre.layout(g);

      // Measure the bounding box of this component.
      let minX = Infinity, minY = Infinity;
      let maxX = 0, maxY = 0;
      comp.forEach((id) => {
        const pos = g.node(id);
        if (pos.x < minX) minX = pos.x;
        if (pos.y < minY) minY = pos.y;
        if (pos.x > maxX) maxX = pos.x;
        if (pos.y > maxY) maxY = pos.y;
      });
      const compW = maxX - minX;
      const compH = maxY - minY;

      // Wrap to next row if this component would overflow the current row.
      if (xCursor + compW > MAX_ROW_WIDTH && xCursor > 0) {
        rowOffset += compH + GAP_Y;
        xCursor = 0;
      }

      comp.forEach((id) => {
        const pos = g.node(id);
        const src = nodes.find((n) => n.id === id);
        if (!src) return;
        laidOut.push({
          ...src,
          position: {
            x: xCursor + (pos.x - minX) + 60,
            y: rowOffset + (pos.y - minY) + 60,
          },
        });
      });
      xCursor += compW + GAP_X;
    });

    // Handle completely isolated (single, unconnected) nodes in a grid.
    const isolated = nodes.filter((n) => !edges.some((e) => e.source === n.id || e.target === n.id));
    isolated.forEach((n, i) => {
      const existing = laidOut.findIndex((l) => l.id === n.id);
      if (existing >= 0) return;
      laidOut.push({
        ...n,
        position: { x: 60 + (i % 5) * 220, y: 60 + Math.floor(i / 5) * 120 },
      });
    });

    const past = [...get().past, { nodes: JSON.parse(JSON.stringify(nodes)), edges: JSON.parse(JSON.stringify(edges)) }];
    if (past.length > 50) past.shift();
    set({ nodes: laidOut as Node<WorkflowNodeData>[], past, future: [] });
  },

  generateFromOrg: (departments) => {
    if (!departments || departments.length === 0) return;
    const state = get();
    const nodes: Node<WorkflowNodeData>[] = [];
    const edges: Edge[] = [];
    const DEPT_X = 80;
    const DEPT_GAP_X = 260;
    const ROLE_START_Y = 140;
    const ROLE_GAP_Y = 110;
    const ROLE_X = DEPT_X + 180;

    departments.forEach((dept, di) => {
      const deptId = `dept_${di}`;
      nodes.push({
        id: deptId,
        type: 'agent',
        position: { x: DEPT_X + di * DEPT_GAP_X, y: 40 },
        data: {
          type: 'agent',
          role: dept.name || '部门',
          goal: '组织部门节点',
          backstory: '',
          llm: 'default',
          skills: [],
          // 绑定到组织结构：deptIdx 指向 org.departments 的索引
          orgRef: { kind: 'department', deptIdx: di },
        },
      });
      (dept.roles || []).forEach((role, ri) => {
        const roleId = `dept_${di}_role_${ri}`;
        nodes.push({
          id: roleId,
          type: 'agent',
          position: { x: ROLE_X + di * DEPT_GAP_X, y: ROLE_START_Y + ri * ROLE_GAP_Y },
          data: {
            type: 'agent',
            role: role.name || `角色${ri + 1}`,
            goal: '执行组织角色职责',
            backstory: '',
            llm: 'default',
            skills: [],
            // 绑定到组织结构：deptIdx/roleIdx 定位到 org 里具体的角色
            orgRef: { kind: 'role', deptIdx: di, roleIdx: ri },
          },
        });
        edges.push({
          id: `e_dept_${di}_role_${ri}`,
          source: deptId,
          target: roleId,
          animated: true,
          style: { stroke: '#94a3b8', strokeWidth: 2 },
        });
      });
    });

    const past = [...state.past, { nodes: JSON.parse(JSON.stringify(state.nodes)), edges: JSON.parse(JSON.stringify(state.edges)) }];
    if (past.length > 50) past.shift();
    set({ nodes, edges, selectedNode: null, past, future: [] });
  },

  validateWorkflow: () => {
    const { nodes, edges } = get();
    const errors: string[] = [];

    if (nodes.length === 0) {
      errors.push('工作流为空');
      return errors;
    }

    // Check disconnected nodes
    const connectedNodeIds = new Set<string>();
    edges.forEach((e) => {
      connectedNodeIds.add(e.source);
      connectedNodeIds.add(e.target);
    });
    nodes.forEach((n) => {
      if (!connectedNodeIds.has(n.id) && nodes.length > 1) {
        errors.push(`节点「${(n.data as any).role || (n.data as any).skillId || n.data.type || n.id}」未连接`);
      }
    });

    // Check for required fields on agent nodes
    nodes.forEach((n) => {
      const d = n.data as Record<string, unknown>;
      if (d.type === 'agent' && !d.role) {
        errors.push(`智能体节点「${n.id}」未设置角色`);
      }
      if (d.type === 'skill' && !d.skillId) {
        errors.push(`技能节点「${n.id}」未设置技能 ID`);
      }
      if (d.type === 'decision' && !d.condition) {
        errors.push(`决策节点「${n.id}」未设置条件`);
      }
    });

    return errors;
  },
}));
