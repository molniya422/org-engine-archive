import { registerPlaybook } from '../engine';

registerPlaybook({
  id: 'audit-run',
  name: '审计运行',
  description: '校验组织配置，执行技能检查，审阅结果并生成合规报告',
  category: 'audit',
  recommendedFor: ['合规检查', '部署前审计', '季度组织健康评估'],
  triggerKinds: ['manual', 'schedule'],
  sourceKinds: ['org', 'run'],
  stages: [
    { id: 'validate', kind: 'validate', title: '校验组织配置', dependsOn: [] },
    { id: 'execute', kind: 'execute', title: '对组织执行技能检查', dependsOn: ['validate'] },
    { id: 'review', kind: 'review', title: '审阅结果', dependsOn: ['execute'] },
    { id: 'export', kind: 'export', title: '生成报告', dependsOn: ['review'] },
  ],
  outputSinks: ['run', 'export'],
  tags: ['audit', 'compliance', 'review', 'security'],
  parameters: [
    {
      key: 'auditScope',
      label: '审计范围',
      type: 'select',
      required: true,
      defaultValue: 'full',
      options: [
        { label: '安全审计', value: 'security' },
        { label: '性能评估', value: 'performance' },
        { label: '全面审查', value: 'full' },
      ],
    },
  ],
  graph: { nodes: [], edges: [] },
  builtIn: true,
});
