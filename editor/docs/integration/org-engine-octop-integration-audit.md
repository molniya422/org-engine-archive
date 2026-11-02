# Org Engine × Octop 内部实现审查与可行性报告

日期：2026-10-18  
审查对象：`D:/claude-ecosystem/org-engine`、`D:/claude-ecosystem/Octop-main/Octop-main` 相关集成路径  
基线分支：`p0-baseline-2026-10-09`

## 结论先行

项目**仍然可行**，但当前不能称为可交付产品，也不能用“已有 25 个 Python 单测通过”替代真实用户验收。

联网搜索不需要本地模型自身具备浏览器能力。可行的分工是：

```text
Org Engine：决定是否允许/必须联网、查询可否外发、域名和隐私范围、证据与引用协议
Octop：向模型暴露搜索工具、执行搜索、返回工具事件和 HITL
本地或云端模型：决定何时调用工具、读取工具结果、组织答案
```

Octop 已有 `searchfree_search`，并已实测能返回 `title/url/content/score`；也有 Tavily、Brave、Google、Kimi 适配器。当前真正的未知点是：真实 Qwen WS 回合是否稳定调用搜索、Org Engine 是否能阻止私密内容进入查询、结果是否能落成可审计引用。因此项目应先完成“真实搜索 Spike”，再继续 UI 和产品化工作。

**建议决策：有条件继续。** 通过 Gate S（真实 Qwen 搜索闭环）后进入实现；Gate S 失败时保留三种降级路径：

1. Org Engine 先调用确定性的搜索工具，再把结果交给本地模型总结。
2. 使用云端模型负责工具调用，本地模型只负责脱敏后的结果整理。
3. 关闭联网能力，明确返回“无法完成，需要联网”，绝不伪造答案或静默使用未知来源。

## 审查限制与证据

- 已阅读 `editor/docs/integration/octop-integration-handoff.md`、`octop-live-spike.md` 和 `2026-10-17-octop-integration-plan.md`。
- 已审查 TS 管线、SQLite 存储、Python service/runner/Octop adapter、协议、确认门禁和个人 UI。
- CodeRabbit CLI 在本机未能运行：安装脚本将当前 `MINGW64_NT-10.0-26100` 识别为不支持的操作系统。因此以下是源码、调用链、现有测试和实机 Spike 的人工审查，**不是 CodeRabbit 输出**。
- 基线验证：Python 集成相关测试 `25 passed`；编辑器后端 `233 passed`；前端 `64 passed`。现有测试没有覆盖真实 TS → Python → Octop → Qwen → 搜索的完整链路。
- 当前工作区已有大量未提交的集成代码和手工 QA 产物；本审查没有清理、回滚或覆盖它们。

## 当前架构与边界

```text
Personal UI
  -> TS Fastify backend / PersonalStore
  -> Python personal service :5174
  -> PersonalRunner / PermissionGate / verifiers
  -> Octop HTTP + WebSocket :8088
  -> local Qwen or OpenAI-compatible provider :18080 / remote provider
  -> Octop tools and HITL
  -> receipts / verification
  -> TS evidence, traces and task status
```

边界方向是正确的：TS 持有 SQLite 和任务状态，Python 负责决策、门禁、执行协调和验证，Octop 负责模型、工具和执行轨迹。Org Engine 不应复制 Octop 的浏览器、连接器、Memory 或搜索实现；它只应约束能力并接收可验证证据。

## 问题清单

### P0：后台执行超时单位错误

位置：`editor/backend-server/src/personal/pipeline.routes.ts:85-95`

`timeout_s: 30 * 60_000` 把 30 分钟按毫秒写进了秒字段，实际值是 18,000,000 秒，约 208 天。HTTP 请求的 `35 * 60_000` 是毫秒，二者不能混用。该错误会让 Python/Octop 认为任务几乎永不超时。

修复要求：`timeout_s: 30 * 60`；HTTP `callService` 的 timeout 继续使用毫秒，并增加单位测试。

### P0：任务执行不耐进程重启

位置：`pipeline.routes.ts:85-133, 201-205`；`editor/backend-server/src/personal/migrations/001_personal.sql:38-48`；`store.ts:233-303`

`void executeRun(...)` 只把 Promise 放在 Node 进程内存中。数据库没有 `executions`/lease/heartbeat/attempt 字段，启动时也没有扫描 `running` 任务。后台重启后任务可能永远停留在 `running`，而 Octop 已有的 `hitl_pending()` 恢复能力没有被调用。

修复要求：增加 durable execution record、`execution_id`、状态、attempt、lease、heartbeat、Octop agent/thread id、contract version；启动时把过期 lease 标为 `recoverable` 并恢复或明确 `interrupted`。恢复必须幂等，不能重复写文件。

### P0：并发 `/run` 存在竞态，且没有幂等键

位置：`pipeline.routes.ts:136-150`、`store.ts:233-303`

路由先读状态，再异步写 `running`。两个并发请求都可能读到 `draft/planned` 并启动两个 Octop turn。`saveTaskWithEvidence` 不是条件更新，执行 trace 也会使用相同的 `trace_id`，重试时可能发生重复或主键冲突。

修复要求：提供 SQLite 条件 claim，例如只允许 `UPDATE ... WHERE status IN (...) AND active_execution_id IS NULL` 成功一次；为 task/execution 建唯一索引；重复请求返回既有 execution；同一 `execution_id` 的 receipt、evidence、trace 使用幂等 upsert。

### P1：搜索没有进入 Org Engine 权限模型

位置：`engine/personal/runner.py:30-45, 64-69, 188-193`

`_TOOL_MAP` 没有 `searchfree_search`、`tavily_search`、`brave_search`、`google_search`、`kimi_search`。未知工具会落入 `(tool, "high")`，无法稳定表达 `web_search`、provider、query 外发、域名范围和隐私状态。当前 `READ_TOOLS` 也不会把搜索放入 Octop 的 per-turn allow list。

修复要求：把能力拆成 `web_search`、`web_fetch`、`external_send` 等 Org Engine 动作；工具名只作为 provider/tool metadata。搜索默认需要联网策略和外发确认，查询不能携带未授权的本地原文。

### P1：搜索证据无法形成引用

位置：`engine/personal/protocols/octop.py:34-58, 123-141`；`editor/backend-server/src/personal/protocol.ts:63-98, 196-205`

现在所有工具都映射为通用 `tool_result` evidence，只保存 trajectory locator 和 hash，没有 query、provider、URL、title、snippet/content、抓取时间、请求 hash、引用关系以及是否包含本地数据的字段。即使模型搜索成功，用户也无法可靠查看“答案来自哪里”。

修复要求：增加版本化 `SearchReceipt`/`SearchEvidence`，至少包含 `query_hash`、脱敏 query、provider、result URL/title/snippet、captured_at、request/response hash、source relation、external disclosure decision。原始敏感 query 不能默认写入普通 trace。

### P1：计划层无法表达“需要搜索”

位置：`engine/personal/service.py:41-74`

`build_plan` 对所有任务都构造一个 `draft` candidate，真实理解全部推迟给 Octop turn。这样规则层无法判断任务是否必须联网，也无法在执行前展示“将把什么查询发给哪个服务”。`allowed_scopes` 目前只表达路径前缀，不能表达域名、provider、recency 或网络开关。

修复要求：在 TaskEnvelope/PlanEnvelope 增加 `network_policy` 和可选 `search_intent`；计划至少能返回 `network_required`、`search_allowed`、`query_redaction`、`allowed_domains`、`requires_confirmation`。不能把“模型自由决定是否联网”当成权限策略。

### P1：个人 UI 仍然显示样例，不是实际管线

位置：`editor/frontend/src/views/PersonalApp.tsx:19-32, 98-114`

`SAMPLE_OUTCOME` 是固定数据，`onRequestTask` 只切 React state，没有调用 POST `/api/v1/personal/tasks/:id/run`，没有轮询任务，也没有展示真实 evidence/trace。当前通过 UI 不能证明用户提交的事项被 Octop 执行。

修复要求：创建真实 task，调用 `/run`，轮询或 SSE 获取状态，按后端返回渲染 verified/awaiting confirmation/blocked/unverifiable，并移除样例 outcome 和 `trace_sample_01`。

### P1：onboarding 配置没有进入后端

位置：`PersonalOnboardingView.tsx:25-28, 109-115`；`PersonalApp.tsx:46-53`；`server.ts` 中 Octop 环境变量配置

用户选择的 workspace、local/cloud model、privacy 和 permissions 只传给回调，最终仅写 `localStorage` 的 `personal-onboarded`。它们没有写入 PersonalStore，也没有可靠更新 Octop workspace/provider。用户选择“在线模型”或“只读”不会改变真实执行能力。

修复要求：保存版本化 personal settings；启动管线前由后端校验 settings 与 Octop agent config 一致；UI 显示实际生效的 provider、workspace 和 network state。

### P1：HITL 和确认 token 不是一个闭环

位置：`confirmation.routes.ts:22-60`；`engine/personal/permission_gate.py:27-30, 74-85, 130-150`

TS 使用未经排序的 `JSON.stringify`，Python 使用 `sort_keys=True` 的 canonical JSON；嵌套对象 key 顺序变化时 hash 不一致。两边的 token 都是进程内 Map/dict，重启后失效。pipeline 也主要直接调用 Python gate，前端 confirmation API 尚未成为执行恢复的唯一入口。

修复要求：共享一个明确的 canonical JSON 算法和协议测试向量；确认票据持久化或使用可验证签名 token；确认必须绑定 task、execution、contract version、action、exact parameters，并支持重启恢复。

### P1：服务边界过度信任本地调用方

位置：`engine/personal/service.py:77-105, 146-193`

服务只绑定 loopback，但没有请求大小限制、request id、认证/shared secret、稳定错误码。每次 `/v1/execute` body 都传 Octop 密码。loopback 不能防止同机恶意进程访问。

修复要求：限制 body bytes；要求每个请求带 request/trace id；使用启动时生成的短期本地 capability token；让 Python 读取受保护的 Octop credential 或传短期 token，不在普通执行请求中传密码；错误按可恢复/需用户/不可恢复分类。

### P2：验证语义和传输可靠性仍有缺口

- `service.py:140-143`：空 receipts 被映射为 `executed_unverified`，应为 `unverifiable`。
- `runner.py:159-172`、`service.py:132-136`：read_file 只验证文件存在，没有保存并比较读取时 hash。
- `octop_http.py:177-204`：`asyncio.run()` 在已有事件循环中会失败；如果 service 将来换 async server，问题会暴露。
- `octop_ws.py` 的 `_sse_frame_getter` 在 SSE 空闲超过 30 秒会超时；本地模型慢时这是现实风险，应等待流结束或分离 idle timeout 与总 deadline。
- `octop_http.py:126-146`：已有同名 agent 时不更新 config；用户更换 workspace 或搜索工具配置可能继续使用旧配置。
- Octop per-agent `config.security` 的 HITL 合并已实测不生效，当前只能依赖全局安全设置；必须把这个事实固化到 adapter preflight，而不是假设 agent 级配置已生效。

## 搜索能力可行性判断

| 问题 | 结论 | 依据/验收 |
|---|---|---|
| Octop 是否有联网搜索工具 | 可行 | 已有 `searchfree_search` 及 Tavily/Brave/Google/Kimi 注册表；`searchfree` 零配置可用 |
| 本地 Qwen 是否必须自己联网 | 不必须 | 工具由 Octop 执行，模型只需发出结构正确的 tool call |
| 本地 Qwen 是否一定会调用搜索 | 未知，不能假定 | 现有 Spike 尚未证明真实 Qwen WS 回合会出现搜索 tool call |
| Org Engine 能否审计搜索 | 当前不能，改造后可行 | 现有通用 tool receipt 缺少 query/provider/source 字段 |
| 没有云端模型是否能继续 | 可以，但有条件 | `searchfree` 本地工具 + 本地模型；若 tool calling 不稳定，改用确定性 pre-search |
| 是否应该复制搜索实现到 Org Engine | 不应该 | 会产生第二套 provider、凭据、网络和安全边界 |

## 目标结合方式

```text
用户事项
  -> Org Engine 读取 settings/rules
  -> 规划 network_policy/search_intent
  -> 对 query 做最小化、脱敏和域名/provider检查
  -> 用户确认外发（若策略要求）
  -> Octop agent 只启用明确的 search/fetch 工具
  -> WS 收集 tool call/result；HITL 继续由 Org Engine 决策
  -> SearchReceipt + SearchEvidence 持久化
  -> 本地/云模型基于带来源结果作整理
  -> verifier 检查引用和最终文件
```

搜索和文件写入必须是两个独立权限：允许搜索不等于允许写文件，允许写草稿也不等于允许外发查询。默认禁止 `external_send`、删除、提交、付款；搜索是否默认允许必须由 onboarding 的 privacy/network 设置明确决定。

## Gate S：继续开发前的最小真实 Spike

在修改 UI 前，执行者必须完成以下闭环并保存原始日志：

1. 启动 llama-server、隔离 Octop、personal service；确认 `/health`、登录和 agent 状态。
2. 给 `personal` agent 显式配置 `web_search_tools: ["searchfree_search"]`，确认实际 agent tool catalog 含 `searchfree_search`。
3. 通过真实 WS 发公开问题，例如“查找今天的某个公开技术项目主页，并给出 URL”，观察 `tool_call_chunk`、`tool_result`、`done`。
4. 收集完整 query、provider、URL、title、content；不能只读 trajectory 截断值。
5. 通过 Org Engine `/v1/plan` 和 `/v1/execute` 运行同一问题，确认 `SearchReceipt` 能落盘，最终答案包含可点击来源。
6. 用包含本地私密文件名/内容的任务测试 query redaction，确认原文不会进入 search tool args。
7. 验证四个失败态：网络关闭、搜索工具关闭、用户拒绝外发、provider 失败。每个都要返回可读状态，不能变成 `verified`。
8. 重启 personal service/Octop 后检查 pending HITL、execution lease 和 evidence 幂等恢复。

**Gate S 通过标准：** 至少 3 次独立公开查询成功；每次都有真实 tool event、来源 URL、SearchReceipt、非伪造引用；四个失败态都可区分；无私密 query 外发；重启不重复写入或丢失任务。未通过时不得进入 Phase D/E。

## 不应继续做的事

- 不再给独立 Electron 壳添加个人助理功能。
- 不在 Org Engine 重写搜索、浏览器、Connector、Memory。
- 不把“模型最终说完成”映射成 verified。
- 不把 cloud provider 当作解决权限和证据问题的替代品。
- 不先做漂亮 UI 再验证真实 Octop 搜索；真实链路是产品可行性的硬前提。

详细逐步执行内容见 `editor/docs/superpowers/plans/2026-10-18-org-engine-octop-integration-plan.md`。
