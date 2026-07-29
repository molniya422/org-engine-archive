import { registerTemplate } from '../template-engine';

registerTemplate({
  id: 'audit-run',
  name: 'Audit Run',
  description: 'Validate org config, run skills, generate report, and review results',
  category: 'audit',
  triggerKinds: ['manual', 'schedule'],
  sourceKinds: ['org', 'run'],
  stages: [
    { id: 's1', kind: 'validate', title: 'Validate org config' },
    { id: 's2', kind: 'execute', title: 'Execute skills against org' },
    { id: 's3', kind: 'review', title: 'Review results' },
    { id: 's4', kind: 'export', title: 'Generate report' },
  ],
  outputSinks: ['run', 'export'],
  tags: ['audit', 'compliance'],
  template: { nodes: [], edges: [] },
  builtIn: true,
});
