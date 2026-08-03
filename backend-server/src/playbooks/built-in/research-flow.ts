import { registerPlaybook } from '../engine';

registerPlaybook({
  id: 'research-flow',
  name: '研究流水线',
  description: '并行研究员协作，综合发现并输出完整报告（CrewAI 模式）',
  category: 'research',
  recommendedFor: ['市场调研', '技术调研', '竞品分析', '可行性研究'],
  triggerKinds: ['manual'],
  sourceKinds: ['org', 'url'],
  stages: [
    { id: 'execute', kind: 'execute', title: '智能体并行研究', dependsOn: [] },
    { id: 'transform', kind: 'transform', title: '综合研究发现', dependsOn: ['execute'] },
    { id: 'review', kind: 'review', title: '编辑审阅', dependsOn: ['transform'] },
    { id: 'export', kind: 'export', title: '导出报告', dependsOn: ['review'] },
  ],
  outputSinks: ['org', 'export'],
  tags: ['research', 'crewai-pattern', 'report', 'analysis'],
  parameters: [
    {
      key: 'researchQuery',
      label: '研究问题',
      type: 'textarea',
      required: true,
      help: '你想研究什么问题？请尽量具体。',
    },
    {
      key: 'depth',
      label: '研究深度',
      type: 'select',
      defaultValue: 'standard',
      options: [
        { label: '快速扫描', value: 'quick' },
        { label: '标准', value: 'standard' },
        { label: '深度调研', value: 'deep' },
      ],
    },
  ],
  graph: { nodes: [], edges: [] },
  builtIn: true,
});
