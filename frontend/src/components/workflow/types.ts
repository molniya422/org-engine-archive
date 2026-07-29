import type { Node, Edge } from '@xyflow/react';

export type WorkflowNodeType = 'agent' | 'skill' | 'decision' | 'parallel' | 'start' | 'end';

/** Base data type for all workflow nodes with index signature for React Flow compatibility */
export interface WorkflowNodeData extends Record<string, unknown> {
  type: WorkflowNodeType;
}

export interface AgentNodeData extends WorkflowNodeData {
  type: 'agent';
  role: string;
  goal: string;
  backstory: string;
  llm: string;
  skills: string[];
}

export interface SkillNodeData extends WorkflowNodeData {
  type: 'skill';
  skillId: string;
  params: Record<string, unknown>;
  timeout: number;
}

export interface DecisionNodeData extends WorkflowNodeData {
  type: 'decision';
  condition: string;
  branches: Record<string, string>;
}

export interface ParallelNodeData extends WorkflowNodeData {
  type: 'parallel';
  branches: string[];
  mergeStrategy: 'all' | 'any' | 'sequence';
}

export type WorkflowNode = Node<WorkflowNodeData>;
export type WorkflowEdge = Edge;

export interface WorkflowDefinition {
  version: '2.0';
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  triggers: string[];
}

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  category: 'scaffold' | 'audit' | 'deploy' | 'research' | 'custom';
  triggers: string[];
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}
