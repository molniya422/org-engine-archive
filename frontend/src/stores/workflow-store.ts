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
  // Actions
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (connection: Connection) => void;
  addNode: (type: string, position: { x: number; y: number }) => void;
  setSelectedNode: (node: Node<WorkflowNodeData> | null) => void;
  updateNodeData: (nodeId: string, data: Partial<WorkflowNodeData>) => void;
  loadWorkflow: (nodes: Node<WorkflowNodeData>[], edges: Edge[]) => void;
  clearWorkflow: () => void;
  // Undo/redo
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  // Tools
  autoLayout: () => void;
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
    const past = [...state.past, { nodes: JSON.parse(JSON.stringify(state.nodes)), edges: JSON.parse(JSON.stringify(state.edges)) }];
    if (past.length > 50) past.shift();
    set({ edges: addEdge({ ...connection, animated: true }, state.edges), past, future: [] });
  },

  addNode: (type, position) => {
    const state = get();
    const id = `node_${Date.now()}`;
    const baseData: WorkflowNodeData = (() => {
      switch (type) {
        case 'agent': return { type: 'agent' as const, role: 'New Agent', goal: 'Enter goal', backstory: '', llm: 'default', skills: [] };
        case 'skill': return { type: 'skill' as const, skillId: 'web-search', params: {}, timeout: 60 };
        case 'decision': return { type: 'decision' as const, condition: 'true', branches: {} };
        case 'parallel': return { type: 'parallel' as const, branches: [], mergeStrategy: 'all' as const };
        default: return { type: 'agent' as const, role: '', goal: '', backstory: '', llm: '', skills: [] };
      }
    })();
    const newNode: Node = { id, type, position, data: baseData };
    const past = [...state.past, { nodes: JSON.parse(JSON.stringify(state.nodes)), edges: JSON.parse(JSON.stringify(state.edges)) }];
    if (past.length > 50) past.shift();
    set({ nodes: [...state.nodes, newNode as Node<WorkflowNodeData>], past, future: [] });
  },

  setSelectedNode: (node) => set({ selectedNode: node }),

  updateNodeData: (nodeId, data) => {
    const state = get();
    const past = [...state.past, { nodes: JSON.parse(JSON.stringify(state.nodes)), edges: JSON.parse(JSON.stringify(state.edges)) }];
    if (past.length > 50) past.shift();
    set({
      nodes: state.nodes.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, ...data } } : n)),
      past,
      future: [],
    });
  },

  loadWorkflow: (nodes, edges) => {
    const state = get();
    const past = [...state.past, { nodes: JSON.parse(JSON.stringify(state.nodes)), edges: JSON.parse(JSON.stringify(state.edges)) }];
    if (past.length > 50) past.shift();
    set({ nodes, edges, selectedNode: null, past, future: [] });
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
    const g = new dagre.graphlib.Graph();
    g.setDefaultEdgeLabel(() => ({}));
    g.setGraph({ rankdir: 'TB', nodesep: 60, ranksep: 80 });

    nodes.forEach((n) => g.setNode(n.id, { width: 180, height: 80 }));
    edges.forEach((e) => g.setEdge(e.source, e.target));

    dagre.layout(g);

    const laidOut = nodes.map((n) => ({
      ...n,
      position: {
        x: g.node(n.id).x - 90,
        y: g.node(n.id).y - 40,
      },
    }));

    const past = [...get().past, { nodes: JSON.parse(JSON.stringify(nodes)), edges: JSON.parse(JSON.stringify(edges)) }];
    if (past.length > 50) past.shift();
    set({ nodes: laidOut as Node<WorkflowNodeData>[], past, future: [] });
  },

  validateWorkflow: () => {
    const { nodes, edges } = get();
    const errors: string[] = [];

    if (nodes.length === 0) {
      errors.push('Workflow is empty');
      return errors;
    }

    // Check disconnected nodes
    const connectedNodeIds = new Set<string>();
    edges.forEach((e) => {
      connectedNodeIds.add(e.source);
      connectedNodeIds.add(e.target);
    });
    nodes.forEach((n) => {
      if (!connectedNodeIds.has(n.id)) {
        errors.push(`Node "${n.data.type || n.id}" is disconnected`);
      }
    });

    // Check for required fields on agent nodes
    nodes.forEach((n) => {
      const d = n.data as Record<string, unknown>;
      if (d.type === 'agent' && !d.role) {
        errors.push(`Agent node "${n.id}" has no role`);
      }
      if (d.type === 'skill' && !d.skillId) {
        errors.push(`Skill node "${n.id}" has no skill ID`);
      }
      if (d.type === 'decision' && !d.condition) {
        errors.push(`Decision node "${n.id}" has no condition`);
      }
    });

    return errors;
  },
}));
