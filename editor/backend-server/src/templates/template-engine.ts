export type TriggerKind = 'manual' | 'schedule' | 'event';
export type SourceKind = 'org' | 'run' | 'upload' | 'url';
export type StageKind = 'validate' | 'transform' | 'execute' | 'review' | 'export';
export type OutputSink = 'org' | 'run' | 'export' | 'memory';

export interface TemplateStage {
  id: string;
  kind: StageKind;
  title: string;
  config?: Record<string, unknown>;
}

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  category: 'scaffold' | 'audit' | 'deploy' | 'research' | 'custom';
  triggerKinds: TriggerKind[];
  sourceKinds: SourceKind[];
  stages: TemplateStage[];
  outputSinks: OutputSink[];
  tags: string[];
  template: {
    nodes: unknown[];
    edges: unknown[];
  };
  builtIn: boolean;
}

const templates = new Map<string, WorkflowTemplate>();

export function registerTemplate(t: WorkflowTemplate): void {
  templates.set(t.id, t);
}

export function listTemplates(category?: string): WorkflowTemplate[] {
  const all = Array.from(templates.values());
  return category && category !== 'all'
    ? all.filter((t) => t.category === category)
    : all;
}

export function getTemplate(id: string): WorkflowTemplate | undefined {
  return templates.get(id);
}

export function deleteTemplate(id: string): boolean {
  return templates.delete(id);
}

export function createUserTemplate(base: Partial<WorkflowTemplate>): WorkflowTemplate {
  const userTemplate: WorkflowTemplate = {
    id: `user_${Date.now()}`,
    name: base.name || 'Custom Template',
    description: base.description || '',
    category: 'custom',
    triggerKinds: base.triggerKinds || ['manual'],
    sourceKinds: base.sourceKinds || ['org'],
    stages: base.stages || [],
    outputSinks: base.outputSinks || ['org'],
    tags: base.tags || ['custom'],
    template: base.template || { nodes: [], edges: [] },
    builtIn: false,
  };
  registerTemplate(userTemplate);
  return userTemplate;
}
