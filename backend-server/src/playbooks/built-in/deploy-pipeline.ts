import { registerPlaybook } from '../engine';

registerPlaybook({
  id: 'deploy-pipeline',
  name: '部署流水线',
  description: '导出 YAML 配置、校验、部署到目标环境并验证结果',
  category: 'deploy',
  recommendedFor: ['组织配置变更部署', '智能体团队 CI/CD', '发布管理'],
  triggerKinds: ['manual', 'event'],
  sourceKinds: ['org'],
  stages: [
    { id: 'export-config', kind: 'export', title: '导出 YAML 配置', dependsOn: [] },
    { id: 'validate', kind: 'validate', title: '校验导出配置', dependsOn: ['export-config'] },
    { id: 'execute', kind: 'execute', title: '部署到目标环境', dependsOn: ['validate'] },
    { id: 'review', kind: 'review', title: '验证部署结果', dependsOn: ['execute'] },
  ],
  outputSinks: ['export'],
  tags: ['deploy', 'pipeline', 'ci-cd', 'release'],
  parameters: [
    {
      key: 'targetEnv',
      label: '目标环境',
      type: 'select',
      required: true,
      defaultValue: 'staging',
      options: [
        { label: '开发', value: 'dev' },
        { label: '预发', value: 'staging' },
        { label: '生产', value: 'production' },
      ],
    },
    {
      key: 'deployStrategy',
      label: '部署策略',
      type: 'select',
      defaultValue: 'rolling',
      options: [
        { label: '滚动更新', value: 'rolling' },
        { label: '蓝绿部署', value: 'blue-green' },
        { label: '重建部署', value: 'recreate' },
      ],
    },
  ],
  graph: { nodes: [], edges: [] },
  builtIn: true,
});
