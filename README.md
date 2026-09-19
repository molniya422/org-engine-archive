# org-engine

**第一个会从自己运行中学习的 agent 组织系统。**

每次运行 = 一次进化事件 → 进化报告 → 对自己 org 配置的 PR → 人类批准 → 组织 git 提交。

- `engine/` — Python 学习闭环(schema/collector/report/rules)+ 治理
- `editor/` — Electron + React + Fastify 编辑器与进化驾驶舱
- `bridge/` — Claude Code hooks 安装层
- `skills/` — 组织绑定的技能库(唯一定义)

状态:M0+M1 开发中。见 `docs/learning-organization-design.md`。