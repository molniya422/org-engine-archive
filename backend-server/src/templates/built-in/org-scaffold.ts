import { registerTemplate } from '../template-engine';

registerTemplate({
  id: 'org-scaffold',
  name: 'Org Scaffold',
  description: 'Create a new organization with departments, roles, and budget in sequence',
  category: 'scaffold',
  triggerKinds: ['manual'],
  sourceKinds: ['org'],
  stages: [
    { id: 's1', kind: 'validate', title: 'Validate org config' },
    { id: 's2', kind: 'transform', title: 'Apply role templates' },
    { id: 's3', kind: 'review', title: 'Review generated structure' },
    { id: 's4', kind: 'export', title: 'Export final config' },
  ],
  outputSinks: ['org', 'export'],
  tags: ['scaffold', 'org'],
  template: { nodes: [], edges: [] },
  builtIn: true,
});
