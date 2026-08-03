import type { Node, Edge } from '@xyflow/react';

export type WorkflowNodeType = 'agent' | 'skill' | 'decision' | 'parallel' | 'channel' | 'meeting' | 'start' | 'end';

/** Base data type for all workflow nodes with index signature for React Flow compatibility */
export interface WorkflowNodeData extends Record<string, unknown> {
  type: WorkflowNodeType;
}

/**
 * 节点到组织结构的绑定引用。由 generateFromOrg 写入，
 * 用于把工作流节点对应回 org.departments 的具体部门/角色。
 */
export interface OrgRef {
  kind: 'department' | 'role';
  deptIdx: number;
  roleIdx?: number;
}

export interface AgentNodeData extends WorkflowNodeData {
  type: 'agent';
  role: string;          // 显示名（来自 org 角色或本地覆写）
  roleRef?: string;      // 强绑定：org 角色全局 id（如 arch.architect）
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

/** 共享通信频道：读写 ACL 按角色 id 或节点 id 声明。 */
export interface ChannelNodeData extends WorkflowNodeData {
  type: 'channel';
  channelKey: string;
  acl: { read: string[]; write: string[] };
}

/** 会议节点：dept_internal / ministerial / decision，参与者可从 org 推导或显式指定。 */
export interface MeetingNodeData extends WorkflowNodeData {
  type: 'meeting';
  meetingType: 'dept_internal' | 'ministerial' | 'decision';
  participants: {
    from: 'department' | 'managers' | 'exec_roles' | 'explicit';
    department?: string;
    roles: string[];
  };
  channel?: string;
  agenda: string;
  output: { write_to: ('channel' | 'flow')[] };
}

export type WorkflowNode = Node<WorkflowNodeData>;

/** 边携带 kind：flow=执行序列，message=点对点通信授权。 */
export interface WorkflowEdge extends Edge {
  data?: { kind?: 'flow' | 'message' };
}

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
