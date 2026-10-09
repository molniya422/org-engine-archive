# Capability Pack 合同（P5.7）

## Schema

`editor/schema/personal/capability-pack.schema.json`（canonical，第 10 个 schema）。
必填字段：`id`（`cap_` 前缀）、`version`、`task_types`、`required_fields`、
`tool_refs`、`required_scopes`、`risk`、`confirmation_policy`、
`evidence_requirements`、`verifier_refs`。

## 注册规则（engine/personal/capabilities/registry.py）

1. **复用 P5.1 工具注册表**：`tool_refs` / `verifier_refs` 引用的工具必须在
   `ToolRegistry` 里已注册——不建立第二套工具系统；引用不存在的工具直接
   `CapabilityValidationError`。
2. **能力不得降低工具要求**：引用的工具里任一是 high-risk，则
   `confirmation_policy.mode` 不得为 `none`——能力描述不能削弱工具自身的
   风险、权限和确认要求。
3. **候选集**：`candidates_for(task_type)` 只返回 `enabled=true` 的包。
   未启用、缺连接器或缺权限的能力永远不会成为可执行候选。
4. **无硬编码分支**：理解层按 `task_type` 查询候选集；新增事务 = `register()`
   一条能力描述，不改写文件/天气/旅行三个场景的判断分支（有测试钉住）。

## 内置能力

| id | task_type | 工具 | 验证器 | 确认策略 |
| --- | --- | --- | --- | --- |
| cap_material_commitment | materials | read_file, read_document, create_draft | create_draft | per_action |
| cap_weather_reminder | weather | create_reminder | create_reminder | per_action |
| cap_travel_planning | travel | create_draft | create_draft | per_action |
| cap_schedule_reminder | schedule（样本） | create_reminder | create_reminder | per_action |

## 接入样本（验收）

测试日程能力 `cap_schedule_reminder` 复用 `create_reminder`：
“明天上午9点提醒我带体检报告”（now=2026-10-09T20:00+08:00）→ 生成记录
`due=2026-10-10T09:00:00+08:00`、时区 Asia/Shanghai、内容「带体检报告」，
并经 `verify_create_reminder` 用真实存储记录验证。

## 组合事项

`compose(steps)` 声明步骤依赖（`depends_on`）和结果引用：

- 只有 **verified** 的上游结果才允许传给下游（未验证的依赖直接拒绝）。
- 每步分别记录 `plan / confirm / execute / verify` 状态。
- 共享上下文通过结果引用传递，不复制原始数据。

## 与计划对应

- “校验工具和验证器引用确实存在” ✅（测试 `test_tool_ref_must_exist_in_tool_registry`）
- “能力描述不得降低工具自身的风险、权限和确认要求” ✅
- “未启用/缺少连接器或权限的能力不能成为可执行候选” ✅
- “接入测试日程能力不需要改写三个场景的判断分支” ✅
- “组合事项声明步骤依赖和结果引用” ✅（compose 的 verified-only 传递）
- “停用测试能力后重复同一请求” → `set_enabled(cap_id, False)` 后
  `candidates_for` 不再返回（机制已测）；自然语言入口返回“暂不可办理”的
  路径由理解层按空候选集输出，属于 P8 首页流程的一部分。
