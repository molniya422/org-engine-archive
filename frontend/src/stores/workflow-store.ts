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
import type { WorkflowNodeData } from '@/components/workflow/types';

interface WorkflowState {
  nodes: Node<WorkflowNodeData>[];
  edges: Edge[];
  selectedNode: Node<WorkflowNodeData> | null;
  templateId: string | null;
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (connection: Connection) => void;
  addNode: (type: string, position: { x: number; y: number }) => void;
  setSelectedNode: (node: Node<WorkflowNodeData> | null) => void;
  updateNodeData: (nodeId: string, data: Partial<WorkflowNodeData>) => void;
  loadWorkflow: (nodes: Node<WorkflowNodeData>[], edges: Edge[]) => void;
  clearWorkflow: () => void;
}

export const useWorkflowStore = create<WorkflowState>((set, get) => ({
  nodes: [],
  edges: [],
  selectedNode: null,
  templateId: null,

  onNodesChange: (changes) => {
    const current = get().nodes;
    const updated = applyNodeChanges(changes, current) as Node<WorkflowNodeData>[];
    set({ nodes: updated });
  },

  onEdgesChange: (changes) => {
    const current = get().edges;
    set({ edges: applyEdgeChanges(changes, current) });
  },

  onConnect: (connection) => {
    const current = get().edges;
    set({ edges: addEdge({ ...connection, animated: true }, current) });
  },

  addNode: (type, position) => {
    const id = `node_${Date.now()}`;
    const baseData: WorkflowNodeData = (() => {
      switch (type) {
        case 'agent':
          return { type: 'agent', role: 'New Agent', goal: 'Enter goal', backstory: '', llm: 'default', skills: [] };
        case 'skill':
          return { type: 'skill', skillId: 'web-search', params: {}, timeout: 60 };
        case 'decision':
          return { type: 'decision', condition: 'true', branches: {} };
        case 'parallel':
          return { type: 'parallel', branches: [], mergeStrategy: 'all' };
        default:
          return { type: 'agent', role: '', goal: '', backstory: '', llm: '', skills: [] };
      }
    })();
    const newNode: Node = { id, type, position, data: baseData };
    set({ nodes: [...get().nodes, newNode as Node<WorkflowNodeData>] });
  },

  setSelectedNode: (node) => set({ selectedNode: node }),

  updateNodeData: (nodeId, data) =>
    set({
      nodes: get().nodes.map((n) =>
        n.id === nodeId ? { ...n, data: { ...n.data, ...data } } : n,
      ),
    }),

  loadWorkflow: (nodes, edges) => set({ nodes, edges, selectedNode: null }),

  clearWorkflow: () => set({ nodes: [], edges: [], selectedNode: null }),
}));
