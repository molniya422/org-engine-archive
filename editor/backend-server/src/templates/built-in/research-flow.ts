import { registerTemplate } from '../template-engine';

registerTemplate({
  id: 'research-flow',
  name: 'Research Flow',
  description: 'Parallel researchers synthesize findings into a comprehensive report (CrewAI pattern)',
  category: 'research',
  triggerKinds: ['manual'],
  sourceKinds: ['org', 'url'],
  stages: [
    { id: 's1', kind: 'execute', title: 'Parallel research by agents' },
    { id: 's2', kind: 'transform', title: 'Synthesize findings' },
    { id: 's3', kind: 'review', title: 'Editor review' },
    { id: 's4', kind: 'export', title: 'Export report' },
  ],
  outputSinks: ['org', 'export'],
  tags: ['research', 'crewai-pattern'],
  template: { nodes: [], edges: [] },
  builtIn: true,
});
