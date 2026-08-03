import { registerPlaybook } from '../engine';

registerPlaybook({
  id: 'org-scaffold',
  name: '组织搭建',
  description: '按顺序创建组织、部门、角色与预算，快速完成多智能体团队脚手架',
  category: 'scaffold',
  recommendedFor: ['从零搭建多智能体团队', '新项目入职/初始化'],
  triggerKinds: ['manual'],
  sourceKinds: ['org'],
  stages: [
    { id: 'validate', kind: 'validate', title: '校验组织配置', dependsOn: [] },
    { id: 'transform', kind: 'transform', title: '应用角色模板', dependsOn: ['validate'] },
    { id: 'review', kind: 'review', title: '审阅生成结构', dependsOn: ['transform'] },
    { id: 'export', kind: 'export', title: '导出最终配置', dependsOn: ['review'] },
  ],
  outputSinks: ['org', 'export'],
  tags: ['scaffold', 'org', 'onboarding'],
  parameters: [
    {
      key: 'orgName',
      label: '组织名称',
      type: 'string',
      required: true,
      defaultValue: 'my_org',
      help: 'URL 安全标识符，例如 my_org',
    },
    {
      key: 'departments',
      label: '部门列表',
      type: 'textarea',
      defaultValue: '架构\n执行\n审阅',
      help: '每行一个部门名称',
    },
    {
      key: 'maxDepth',
      label: '最大委派深度',
      type: 'number',
      defaultValue: 3,
      help: '1-5，最大委派深度',
    },
  ],
  graph: { nodes: [], edges: [] },
  builtIn: true,
});
