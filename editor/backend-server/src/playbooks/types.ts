export type TriggerKind = 'manual' | 'schedule' | 'event';
export type SourceKind = 'org' | 'run' | 'upload' | 'url';
export type StageKind = 'validate' | 'transform' | 'execute' | 'review' | 'export';
export type OutputSink = 'org' | 'run' | 'export' | 'memory';
export type PlaybookCategory = 'scaffold' | 'audit' | 'deploy' | 'research' | 'custom';

export interface PlaybookParameter {
  key: string;
  label: string;
  type: 'string' | 'number' | 'boolean' | 'select' | 'textarea';
  required?: boolean;
  defaultValue?: unknown;
  options?: { label: string; value: string }[];
  help?: string;
}

export interface PlaybookStage {
  id: string;
  kind: StageKind;
  title: string;
  config?: Record<string, unknown>;
  dependsOn?: string[];
  allowedAgentTypes?: string[];
}

export interface WorkflowPlaybook {
  id: string;
  name: string;
  description: string;
  category: PlaybookCategory;
  recommendedFor: string[];
  triggerKinds: TriggerKind[];
  sourceKinds: SourceKind[];
  stages: PlaybookStage[];
  outputSinks: OutputSink[];
  tags: string[];
  parameters: PlaybookParameter[];
  graph: { nodes: unknown[]; edges: unknown[] };
  builtIn: boolean;
}
