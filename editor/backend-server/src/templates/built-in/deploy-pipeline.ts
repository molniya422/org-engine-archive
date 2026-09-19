import { registerTemplate } from '../template-engine';

registerTemplate({
  id: 'deploy-pipeline',
  name: 'Deploy Pipeline',
  description: 'Export config as YAML, validate, deploy, and verify deployment',
  category: 'deploy',
  triggerKinds: ['manual', 'event'],
  sourceKinds: ['org'],
  stages: [
    { id: 's1', kind: 'export', title: 'Export config as YAML' },
    { id: 's2', kind: 'validate', title: 'Validate exported config' },
    { id: 's3', kind: 'execute', title: 'Deploy to target' },
    { id: 's4', kind: 'review', title: 'Verify deployment' },
  ],
  outputSinks: ['export'],
  tags: ['deploy', 'pipeline'],
  template: { nodes: [], edges: [] },
  builtIn: true,
});
