import { WorkflowPlaybook } from './types';

const playbooks = new Map<string, WorkflowPlaybook>();

export function registerPlaybook(p: WorkflowPlaybook): void {
  playbooks.set(p.id, p);
}

export function listPlaybooks(category?: string): WorkflowPlaybook[] {
  const all = Array.from(playbooks.values());
  return category && category !== 'all'
    ? all.filter((p) => p.category === category)
    : all;
}

export function getPlaybook(id: string): WorkflowPlaybook | undefined {
  return playbooks.get(id);
}

/**
 * Map playbook stage kinds onto canvas-compatible node types.
 * Frontend WorkflowCanvas only registers: agent | skill | decision | parallel.
 */
function stageToNode(s: { id: string; kind: string; title: string }, index: number) {
  const position = { x: index * 260, y: 120 };
  switch (s.kind) {
    case 'validate':
    case 'review':
      return {
        id: s.id,
        type: 'decision',
        position,
        data: {
          type: 'decision',
          condition: s.title || s.kind,
          branches: {},
          label: s.title,
          stageKind: s.kind,
        },
      };
    case 'transform':
    case 'export':
      return {
        id: s.id,
        type: 'skill',
        position,
        data: {
          type: 'skill',
          skillId: s.title || s.kind,
          params: {},
          timeout: 60,
          label: s.title,
          stageKind: s.kind,
        },
      };
    case 'execute':
    default:
      return {
        id: s.id,
        type: 'agent',
        position,
        data: {
          type: 'agent',
          role: s.title || s.kind,
          goal: s.title || '',
          backstory: '',
          llm: 'default',
          skills: [],
          label: s.title,
          stageKind: s.kind,
        },
      };
  }
}

/**
 * Generate a fallback graph from stages when nodes/edges are empty.
 * One canvas-compatible node per stage, connected by dependsOn or sequential order.
 */
export function generateFallbackGraph(
  p: WorkflowPlaybook,
): { nodes: unknown[]; edges: unknown[] } {
  if (p.graph.nodes.length > 0 || p.graph.edges.length > 0) {
    // Normalize any legacy playbookStage nodes into canvas types
    const nodes = (p.graph.nodes as any[]).map((n, i) => {
      if (n?.type && n.type !== 'playbookStage') return n;
      const kind = n?.data?.kind || n?.data?.stageKind || 'execute';
      const title = n?.data?.label || n?.data?.role || n?.id || `stage-${i}`;
      return stageToNode({ id: n.id || `stage-${i}`, kind, title }, i);
    });
    return { nodes, edges: p.graph.edges };
  }

  const nodes = p.stages.map((s, i) => stageToNode(s, i));

  // Build edges from dependsOn; fall back to sequential order
  const edges: { id: string; source: string; target: string; animated?: boolean }[] = [];
  const hasDeps = p.stages.some((s) => s.dependsOn && s.dependsOn.length > 0);

  if (hasDeps) {
    for (const s of p.stages) {
      if (s.dependsOn) {
        for (const dep of s.dependsOn) {
          edges.push({ id: `e-${dep}-${s.id}`, source: dep, target: s.id, animated: true });
        }
      }
    }
  } else {
    for (let i = 1; i < p.stages.length; i++) {
      edges.push({
        id: `e-${p.stages[i - 1].id}-${p.stages[i].id}`,
        source: p.stages[i - 1].id,
        target: p.stages[i].id,
        animated: true,
      });
    }
  }

  return { nodes, edges };
}

export interface ApplyPlaybookRequest {
  mode: 'create_org' | 'apply_to_org' | 'workflow_only';
  orgId?: string;
  params: Record<string, unknown>;
}

export interface ApplyPlaybookResponse {
  success: boolean;
  orgId?: string;
  workflow: { nodes: unknown[]; edges: unknown[] };
  message: string;
}

export async function applyPlaybook(
  id: string,
  mode: 'create_org' | 'apply_to_org' | 'workflow_only',
  params: Record<string, unknown>,
  orgId?: string,
): Promise<ApplyPlaybookResponse> {
  const p = playbooks.get(id);
  if (!p) throw new Error('Playbook not found');

  // Validate required params
  for (const param of p.parameters) {
    if (param.required && !params[param.key]) {
      throw new Error(`Required parameter "${param.key}" is missing`);
    }
  }

  const graph = generateFallbackGraph(p);
  let resultOrgId = orgId;

  if (mode === 'create_org') {
    resultOrgId = `org_${Date.now()}`;
    // Phase 2 enhancement: persist org config from params
  }

  return {
    success: true,
    orgId: resultOrgId,
    workflow: graph,
    message: `剧本「${p.name}」已应用（${mode}）`,
  };
}
