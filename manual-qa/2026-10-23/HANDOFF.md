# Org Engine × Octop — 项目总结与接手文档

> 日期：2026-10-24
> 分支：`p0-baseline-2026-10-09`（未提交，57 个未跟踪/修改文件）
> 上游文档：
> - `editor/docs/superpowers/plans/2026-10-23-org-engine-octop-remaining-plan.md`（本轮执行计划，72/114 步已勾选）
> - `editor/docs/integration/org-engine-octop-integration-audit.md`（Gate S 闸门定义）
> - `manual-qa/2026-10-23/e2e-integration.md`（端到端联调记录，含 4 个缺陷）
> - `manual-qa/2026-10-18/search-spike/report.md`（Gate S 失败报告）
> - `editor/docs/integration/octop-live-spike.md`（Octop 实机事实）

---

## 0. 一句话状态

**Core 链路已首次真实跑通 `verified`（14 条证据、10 条验证）；搜索能力（Gate S）未通过，UI 仍显示样例数据。**

```
task: task_verify_v2        → verified
exec: exec_4c72542d122440a4 → verified
evidence: 14 条 tool_result
trace: status=verified, verifications=10
```

证据：`manual-qa/2026-10-23/successful-run/personal/personal.sqlite`

---

## 1. 本轮干了什么

### 1.1 补齐了"组件齐但管线无"的断层

上一轮的结论是：*所有能力都存在且单测通过，但从没被一条真实链路串起来*。本轮把每一环都接通并验证：

| 层 | 之前 | 现在 |
|---|---|---|
| UI → TS | 无（硬编码 `SAMPLE_OUTCOME`、`rules={[]}`、`tasks={[]}`） | ❌ **仍未接**（Gate S 阻塞） |
| TS → Python | 只有 stub 单测 | ✅ **真实跑通** |
| Python → Octop | 跑过一次但以 reject 收场 | ✅ **真实跑通，verified** |
| Octop → 模型/工具 | 已验证 | ✅ 保持 |

### 1.2 挂载了 7 个"孤儿路由"

**这是最典型的假绿**：`eval.routes.ts`、`replay.routes.ts`、`simulation.routes.ts`、`rule.routes.ts`、`model.routes.ts`、`learning.routes.ts`、`octop.routes.ts` 七个模块各有单测、全部通过，但 `server.ts` **从未 import 它们**。生产环境里这些端点全是 404。

已挂载前 6 个（`octop.routes.ts` 按设计保留未挂，它是旧"双控制台"思路的遗留）。并加了**防回退守卫测试** `tests/personal-route-mounting.test.ts`，用文本扫描确保每个 register 函数至少出现两次（import + 调用）。

实测验证：

| 端点 | 响应 |
|---|---|
| `GET /api/v1/personal/model/health` | `{"provider":"none",...,"ok":false}` |
| `GET /api/v1/personal/learning/proposals` | `{"proposals":[]}` |
| `POST /api/v1/personal/rules/:id/check` | `{"outcome":"allow",...}` |
| `POST /api/v1/personal/eval/run` | 正确判定 `ready:false` |
| `POST /api/v1/personal/simulate` | `{"simulated":true,"status":"simulated"}` |

### 1.3 统一了跨语言 canonical JSON

**原问题**：TS 用未排序的 `JSON.stringify`，Python 用 `json.dumps(sort_keys=True)` 但保留默认分隔符 `", "` / `": "`。**两侧对同一对象算出的 hash 必然不同** —— 意味着 TS 签发的确认令牌永远无法被 Python 校验。

新建 `canonical-json.ts` / `canonical_json.py` + 6 组共享 golden 向量。实测 `{"x":1.0}` 两侧都得出 `sha256:5041bf1f…`。

处理了三个跨语言陷阱：
1. **JS 的 `.sort()` 是 UTF-16 码元排序**，Python 是码点排序 —— emoji 和全角字符顺序不同。用显式 `byCodePoint` 比较器。
2. **整数浮点**：JSON 文本 `{"x":1.0}` 在 TS 里是 `1`，Python 里是 `float`。Python 侧归一化为 int。
3. **非整数浮点**：两侧都拒绝（`repr(1.0)="1.0"` vs `String(1.0)="1"` 无法对齐）。

### 1.4 执行记录持久化

原来 `void executeRun(...)` 只活在 Node 内存里，重启即丢。

新增：
- `004_executions.sql`：executions 表（9 种状态）+ 部分唯一索引（同一 task 只能有一个活跃执行）
- `005_execution_runspec.sql`：`run_spec` 列（存 envelope + plan，供重启后重放）
- `ExecutionStore`：原子 claim / 心跳租约 / 崩溃恢复 / fencing

关键不变量（都有测试）：
- 并发 `/run` 返回**同一个** `execution_id`，只启动一个 Octop turn（已实测验证）
- 过期租约 → `recoverable`，**同时把 task 从 `running` 改成 `blocked`**
- 终态不可被过期写入改写（`markRunning` 只在 `queued` 时生效，`finish` 有 owner 栅栏）

### 1.5 durable worker 化 `/run`

`pipeline.routes.ts` 重写为：claim → plan → 执行 → **先落证据再翻终态** → finish。

修掉的 Critical：
- **超时的 turn 会被记成 `verified`**：Python 侧 `status="timeout"` 但 `overall_verification="verified"`（因为它只看 verifications 不看 status）。TS 侧现在要求 `status === 'done' && error == null` 才信任 verified。
- **`policy_error` fail-open**：原来只特判 blocked/ask_user/needs_confirmation，其它一律执行。现在只有 `select` 才执行。
- **claim 后任何路由错误都会泄漏 claim**：现在整段包 try/catch，出错时 `finish(recoverable)`。

### 1.6 搜索工具纳入 HITL（安全修复）

**这是最关键的安全发现**：

审计文档说"搜索工具必须纳入 HITL"，但实际检查发现——**Octop 全局 HITL 默认工具集是 `bash/execute/write_file/edit_file/delete`，不含任何搜索工具**。

而 `runner._on_hitl` 里的搜索隐私检查（`evaluate_search`）**只在 HITL 触发时才执行**。所以搜索会直接执行，Org Engine 永远看不到 query，整个 `search_policy.py` 是装饰品。

实测证据（Gate S 期间）：

```
agent 挂载的搜索工具: brave_search, google_search, kimi_search,
                     searchfree_search, tavily_search, web_fetch
全局 HITL 工具:       edit_file, write_file        ← 只有 2 个
```

修复后的预检 `agent_preflight(..., gate_all_search_tools=True)` 会检查 **agent 上所有已挂载的搜索工具**是否都在 HITL 清单里，而不只是 `network_policy` 里配置的 provider（否则 agent 上挂的其他搜索工具仍可绕过）。

### 1.7 端到端联调发现 4 个真实缺陷

**这 4 个全部是单测覆盖不到的**（stub 服务立即响应、接受任意 body、返回 200）。

| # | 缺陷 | 严重度 | 现象 | 修复 |
|---|---|---|---|---|
| D1 | `confirmation_token` 混入 `TaskEnvelope` | **Critical** | `/v1/plan` 500：`TypeError: unexpected keyword argument 'confirmation_token'` —— **所有任务的 plan 都失败** | token 改为独立参数，一路传到 `executeRun` / `dispatch` / `run_spec` |
| D2 | `ServiceUnavailableError.detail` 被丢弃 | Important | trace 只有 `request failed`，无法定位 | 拼接 `detail` 进 `msg` |
| D3 | 超时配置卡边界 | Important | Python 已跑完准备返回 200，TS 已断开 | fetch 35→60 分钟，turn 30→55 分钟 |
| D4 | **Node fetch 的 300 秒 headersTimeout** | **Critical** | `fetch failed; cause: Headers Timeout Error` | **改用 `node:http` 重写 `callService`** |

**D4 详解**：Node 内置 `fetch`（undici）有硬编码的 300 秒 `headersTimeout`，**`AbortSignal.timeout` 无法覆盖它**。Python service 要等整个 execute 跑完才写响应头，本地模型一轮 30 分钟 → 必然被掐断，成功执行被误判成 `recoverable`。只有换成 `node:http`（socket 空闲超时而非 headers 超时）才能解决。

---

## 2. 还没干什么

### 2.1 Gate S（搜索闭环）— **FAIL**

判定：**1/8 通过**

| 通过标准 | 结果 |
|---|---|
| 3 次独立公开查询成功 | ❌ 第 1 次超时（1430 秒），第 2/3 次未跑 |
| 每次都有真实 tool event | ✅ 第 1 次有（seq=14） |
| 每次都有来源 URL | ❌ |
| SearchReceipt 落盘 | ❌ |
| 四个失败态可区分 | 未执行 |
| 无私密 query 外发 | 未执行 |
| 重启不重复写入 | 未执行 |

**失败原因（不是隐私问题）**：

1. **`searchfree.site` 端点间歇性不可用**
   - 直接 httpx 调用 → 200 + 正常 JSON
   - 通过 Octop 工具调用 → `Error: searchfree request failed: Server disconnected`
2. **模型收到搜索错误后改用 `web_fetch` 直接抓 URL** → 页面太大 → `Tool result too large` → 落盘到 `.octop/large_tool_results/` → 模型进入读取大文件循环 → 30 分钟耗尽

已做的缓解：
- 禁用 `web_fetch`
- 修 `search_receipt_from_receipt` 的字符串解析（`searchfree_search` 返回的是 **JSON 字符串**，不是 dict）
- 工具从 38 精简到 11

**未复跑**。

### 2.2 Task 8：UI 接真 — **未启动**

按审计硬要求"Gate S 未通过不得进入 Phase D/E"，此任务被阻塞。

当前 UI 状态（实测）：

```
grep -c "SAMPLE_OUTCOME|trace_sample_01" PersonalApp.tsx  →  3
```

`PersonalApp.tsx` 仍然：
- 渲染固定的 `SAMPLE_OUTCOME`
- 用 `trace_sample_01` 作为诊断页数据
- `rules={[]}` / `proposals={[]}` / `tasks={[]}` 全是空数组
- 前端 personal 视图里 `fetch` / `personalApi` 出现次数 **全为 0**

### 2.3 其他未完成

| 项 | 状态 |
|---|---|
| Task 11 Phase C 复跑 | 被 Task 12 的完整验证取代（同一场景，证据更完整） |
| Task 13 人工验收 MUA-01..07 | 未执行 |
| Task 14 更新审计与交接 | 部分（本文档 + `e2e-integration.md` 已完成） |
| 跨语言 token 握手 | **未实现** —— hash 算法统一了，但 `runner._make_gate` 仍**忽略**传入的 token，TS 签发的 token 无法被 Python 校验 |
| HITL 在真实链路触发 | 未验证（本轮任务是只读的，`hitl: 0`） |
| `octop.routes.ts` 处置 | 仍是死代码，待评估删除 |
| `tsc --noEmit` 的 8 条历史错误 | 未修（`learning/apply.ts`、`learning/routes.ts`、`personal/evidence.ts`、`store.ts`） |
| `engine/harness` 的 pytest collection 失败 | 未修（历史问题） |

---

## 3. 剩余计划

### P0 — 立刻做（解除阻塞）

**P0.1 让 Gate S 变得可判定**

三个选项，按推荐顺序：

| 方案 | 做法 | 代价 |
|---|---|---|
| **A（推荐）确定性 pre-search** | Org Engine 自己调搜索 API，把结果作为 `redacted_state` 传给模型总结。模型不参与搜索决策 | 需要新增一个搜索客户端；但完全可控、可测、不依赖模型 tool-calling 稳定性 |
| B 换 provider | 配 `TAVILY_API_KEY` 或 `BRAVE_API_KEY`，用商业 provider 替代 searchfree | 需要 API 额度 |
| C 换云端模型 | 用云端模型负责 tool calling，本地模型只总结 | 数据外发，与本地优先定位冲突 |

选 A 的理由：审计本身列举了这条降级路径；且 `search_policy.py` 的逻辑完全可复用；不需要模型"会调用工具"这个不确定前提。

**P0.2 复跑 Gate S**

无论选哪个方案，都必须跑完这 8 项并写进 `search-spike/report-v2.md`：
- 3 次公开查询 + 来源 URL
- 隐私 canary 不外泄
- 4 种失败态可区分
- 重启不重复写入

**P0.3 决定是否放行 UI 接真**

Gate S 通过后，才能做 Task 8。

### P1 — Task 8：UI 接真

`editor/frontend/src/views/PersonalApp.tsx` 需要：
1. 撤掉 `SAMPLE_OUTCOME` / `trace_sample_01`
2. 新建 `api/pipeline.ts`（`createTask` / `runTask` / `getTask` / `getExecution` / `resumeExecution`）
3. 真实流程：填目标 → 建任务 → `/run` → 轮询 `/executions/:id` → 渲染 `queued/running/awaiting_confirmation/verified/blocked/unverifiable`
4. 证据面板读真实 `evidence` 数组
5. 错误可读（`not_ready` 要显示三项检查明细）

计划里已有完整的实现草案（Task 8，约 400 行），可直接执行。

### P2 — 性能

**必须先解决，否则产品不可用**：

| 指标 | 实测 |
|---|---|
| prompt tokens | **13,537** |
| prefill 速度 | 13-14 tok/s |
| 单轮总耗时 | **约 30 分钟** |

**关键发现**：把工具从 38 精简到 11 后，prompt **没有明显变小**（13.5k 仍很大）。说明 **harness 的系统提示本身占大头**，不是工具 schema。

方向：
- 换更快的模型（当前 Qwen3.6-35B-A3B 在 6GB VRAM 上跑不动）
- 或换更小的模型（7B/14B 级别）
- 或减小 harness 系统提示（需要改 Octop，超出本层范围）

### P3 — 跨语言 token 握手

当前问题：
- `runner._make_gate` 收了 `token` 参数但**忽略它**，返回空 `PermissionGate`
- `pipeline.routes.ts` 读 `envelope.confirmation_token`，但 `TaskEnvelope` 没这个字段（D1 修复后改为独立参数，但还没接进握手）
- TS 的 `ConfirmationGate` 和 Python 的 `PermissionGate` 是两个互不相通的进程内 Map

需要：
1. Python 加 `register_ticket` / `/v1/confirmations/register`
2. token 一路传到 `PermissionGate`
3. 加一条"TS 算 hash → Python 校验"的跨语言测试

### P4 — 人工验收

MUA-01..07（首次启动 / 资料整理 / 天气 / 旅行 / 学习 / 失败恢复 / 重启导出）。

其中 MUA-03/04 需要真实天气/酒店连接器（目前是 fixture），应标记 BLOCKED。

---

## 4. 遇到的问题（按类型）

### 4.1 架构层

**"假绿"是最大陷阱。** 本轮三次遇到：
1. 7 个路由模块有单测但从未挂载 → 238 个后端测试全绿，端点全 404
2. 前端视图零 API 调用，但测试断言的是"渲染了样例"
3. `search_policy.py` 有 20 个测试，但 HITL 不触发时它根本不会执行

**教训**：单测覆盖的是"模块自己的逻辑"，不是"模块被接进系统"。
**对策**（已落地）：加挂载守卫测试（扫 `server.ts` 文本）；关键路径必须有真实端到端验证。

### 4.2 跨语言层

| 问题 | 教训 |
|---|---|
| canonical JSON 不一致 | 排序规则、分隔符、浮点表示、Unicode 排序 **四个地方都会分歧**。必须有共享 golden 向量 |
| 整数浮点 | JSON 文本 `1.0` 在 TS 里是 `1`，Python 里是 `float`。要么归一化，要么在协议层禁止 |
| JS `.sort()` 是 UTF-16 | 与 Python 码点排序在 emoji 上不同 |

### 4.3 传输层

**Node fetch 的 300 秒 headersTimeout 是最隐蔽的坑。**

- 它**不在** `AbortSignal.timeout` 的控制范围内
- 报错是 `Headers Timeout Error`，看起来像网络问题
- 只有 `node:http` 能绕开

**教训**：任何"服务端要跑很久才响应"的调用，都不能用 Node 内置 fetch。

### 4.4 模型层

| 问题 | 表现 |
|---|---|
| 速度极慢 | 13.5k prompt / 13 tok/s / 单轮 30 分钟 |
| tool calling 不稳定 | 搜索失败后改用 `web_fetch`，陷入大文件循环 |
| reasoning 型模型 | `reasoning_content` 先于 `content`，需要剥离 |
| turn 串行 | 同 thread 回合排队，外部驱动必须等 `done` |
| **超时不取消后端 turn** | `timeout_s` 到期只断开 WS，Octop 侧继续跑完 → 残留 turn 抢算力（实测速度从 13.5 掉到 3.3 tok/s）。**已修**：超时时发 `{"type":"cancel"}` 帧 |

### 4.5 Windows/环境

| 问题 | 解法 |
|---|---|
| `uv sync` 失败 | 系统 python 是 32 位；用 `uv python install 3.12-windows-x86_64-none` |
| 路径反斜杠 | JSON body 里必须用正斜杠，否则 `Invalid \escape` |
| MINGW 中文输出 | `PYTHONIOENCODING=utf-8` |
| 端口冲突 | 旧 backend 未退出时新实例会落到 +1 端口，`curl` 到错端口会读到旧代码 |
| `serve(port=0)` | 原实现 `port or int(...)` 把 0 当假值，测试会绑定固定端口 → 已修为 `if port is None` |

---

## 5. 代码地图（接手必读）

### 5.1 Python 侧（`engine/personal/`）

| 文件 | 职责 | 状态 |
|---|---|---|
| `service.py` | stdlib HTTP 壳：`/v1/plan` `/v1/execute` `/v1/verify` `/v1/eval` `/v1/replay` `/v1/simulate` | ✅ |
| `runner.py` | 门禁决策 + 逐回执验证 + 搜索策略接入 | ✅ |
| `adapters/octop_http.py` | 真实 HTTP 客户端 + `agent_preflight` / `ensure_hitl_tools` | ✅ |
| `adapters/octop_ws.py` | WS 回合收集 + HITL resume SSE + 超时取消 | ✅ |
| `search_policy.py` | 搜索隐私裁决（唯一真源） | ✅ 未被真实触发 |
| `search_receipts.py` | SearchReceipt + 字符串/JSON 双形态解析 | ✅ 未真实落盘 |
| `canonical_json.py` | 跨语言 canonical JSON | ✅ |
| `envelopes.py` | TaskEnvelope / PlanEnvelope + `network_policy` | ✅ |

### 5.2 TS 侧（`editor/backend-server/src/personal/`）

| 文件 | 职责 | 状态 |
|---|---|---|
| `pipeline.routes.ts` | durable worker：claim → plan → execute → evidence → 终态 | ✅ |
| `executions.ts` | ExecutionStore：claim / heartbeat / recover / park / requeue | ✅ |
| `service-client.ts` | Python service 客户端（**node:http**，非 fetch） | ✅ |
| `route-guard.ts` | readiness 三项检查 | ✅ |
| `settings.routes.ts` | onboarding 设置持久化 | ✅ |
| `canonical-json.ts` | canonical JSON（与 Python 对齐） | ✅ |
| `store.ts` | PersonalStore + `updateTaskStatus` + `saveSearchReceipt` | ✅ |
| `confirmation.routes.ts` | 确认令牌（**跨语言握手未实现**） | ⚠️ |
| `octop.routes.ts` | 死代码，未挂载 | ❌ 待评估 |

### 5.3 前端

| 文件 | 状态 |
|---|---|
| `PersonalApp.tsx` | ❌ 仍渲染 `SAMPLE_OUTCOME` |
| `PersonalOnboardingView.tsx` | ✅ 已 PUT 到 `/api/v1/personal/settings` |
| `api/personal.ts` | 只有 `LocalModelDiagnostics` 在用 |
| `api/pipeline.ts` | **不存在**（Task 8 要建） |

---

## 6. 测试基线

| 套件 | 结果 | 命令 |
|---|---|---|
| Python `engine/personal` | **378 passed** | `cd engine && PYTHONPATH=. python -m unittest discover -s personal -p "*_test.py" -t .` |
| TS 后端 | **329 passed / 45 files** | `cd editor/backend-server && npx vitest run` |
| TS 前端 | **64 passed / 10 files** | `cd editor/frontend && npm test` |

**已知失败（历史，非本轮引入）**：
- `npx tsc --noEmit`：8 条类型错误，位于 `learning/apply.ts`、`learning/routes.ts`、`personal/evidence.ts`、`store.ts`
- `engine/harness` 的 pytest collection 失败（`SystemExit: 1`）

---

## 7. 复现成功链路

见 `manual-qa/2026-10-23/e2e-integration.md` 的"复现步骤"一节。

关键点：
1. **必须在 `editor/backend-server` 目录启动 backend**（否则 tsx 找不到 `src/server.ts`）
2. 四个服务都要起：llama-server / Octop / personal service / backend
3. 单轮约 30 分钟
4. 结果直接查 SQLite：`manual-qa/2026-10-23/successful-run/personal/personal.sqlite`

---

## 8. 给接手者的三条建议

1. **先让 Gate S 可判定，再碰 UI。** 当前 `search_policy.py` 的 20 个测试证明的是"策略逻辑对"，不是"隐私真的被执行"。用确定性 pre-search 比赌模型 tool-calling 稳。

2. **测试绿不等于链路通。** 本轮 4 个 Critical 缺陷全部是端到端联调才发现的。任何"服务端要跑很久"的路径，必须有真实验证，不能只靠 stub。

3. **性能是产品化的硬门槛。** 30 分钟一轮的本地模型，即使功能全对也无法交付。P2 的优先级应该被提到 P1 之前——先证明"更快的模型能跑通同一条链路"，再谈 UI。

---

## 9. 未提交变更说明

57 个未跟踪/修改文件，全部是本轮及上一轮的工作成果。**未提交**（遵循 2026-10-18 计划的"不提交、不建分支"约定）。

`engine/training-loop/meta.json` 的改动是 hook 自动写入的（`sessions: 3 → 15`），**不要提交**。

建议在用户明确要求时，按 Task 粒度分成若干 commit：
- `feat(personal): mount 7 orphan route modules + guard test`
- `feat(personal): canonical JSON shared by TS and Python`
- `feat(personal): durable execution records + worker`
- `feat(personal): search tools gated by HITL preflight`
- `feat(personal): onboarding settings + readiness guard`
- `fix(personal): use node:http for long-running service calls`
- `docs: handoff and e2e evidence`
