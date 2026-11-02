# Octop × Org Engine 结合 — 接手文档

> 读者：接管这个方向的 AI agent / 人。
> 初版：2026-10-17 晚；**最近更新：2026-10-18 夜（第二批修复与搜索策略落地）**。
> 上一篇对话上下文：
> `D:\claude-ecosystem\.claude\projects\D--claude-ecosystem\b5cffa0a-46f4-488e-b65e-3e8298e301af.jsonl`
>（compact 前的完整记录，含所有原始命令输出）。
>
> **先读这三个文件再动代码**（优先级从高到低）：
> 1. **`editor/docs/integration/org-engine-octop-integration-audit.md`** — 2026-10-18 独立审查，
>    给出 P0/P1/P2 缺陷清单与 **Gate S**（真实搜索闭环）验收标准。**这是当前最高优先级文档。**
> 2. `editor/docs/superpowers/plans/2026-10-18-org-engine-octop-integration-plan.md` — 逐任务执行计划
>    （Task 1–11）。Task 1/2 已全部完成并勾选，Task 3/4 的 Python 侧已完成。
> 3. `editor/docs/integration/octop-live-spike.md` — Octop 实机行为（别信官网文档，信这个）
>
> 方案总纲（历史）：`editor/docs/superpowers/plans/2026-10-17-octop-integration-plan.md`。

---

## 0. 一句话状态

**Octop 为主体 + Org Engine 决策层的方向已定且已真机跑通一次。截至 2026-10-18 夜：Python 侧
327 个测试全过（含新增 85 个聚焦测试），TS 后端 238 个测试全过；审计点名的 P0 超时单位、
SSE 空闲超时、`asyncio.run` 陷阱、空集验证语义已修复；`network_policy` 与搜索策略/搜索回执
已落地。**但 Gate S（真实 Qwen 搜索闭环）仍未验证过任何一次**——三个服务当前都是停的。
Phase D（UI 接真）与 Phase E（并入 Octop 控制台）按审计要求**在 Gate S 通过前不得开工**。**

---

## 1. 干了什么（按时间/依赖顺序）

### 1.1 方向纠正（关键背景）

用户原始计划：`2026-10-04-local-personal-decision-assistant-plan.md` + `2026-10-04-laya-octop-project-review.md`，定位是 **Octop 执行底座 + Org Engine 之上的个人决策层**。
此前交付的 `release/Org Engine Editor Setup 0.1.0.exe`（独立 Electron NSIS）是"第二个控制台"，计划复盘里的 kill criteria 正点名这种形态，用户评价"没有任何能用的地方"。

纠正后的目标架构（详见结合方案 §2）：

```text
[Octop :8088 —— 主体应用]  模型/Agent/连接器管理；agent "personal" workspace=授权目录
                          execute 禁用；write_file/edit_file → HITL 暂停
[Org Engine 决策层 —— 进程隔离，loopback 互访，永不写对方库]
  ├─ TS backend（已有）：personal.sqlite、个人 API、审计、管线状态机
  ├─ Python engine service :5174（新增薄壳）：plan / execute / verify
  └─ OctopTransport（新增）：WS user_turn 驱动 + HITL 门禁 + 回执采集
[小白 UI]                  事项/规则/依据/确认，不出现 Agent 术语
```

### 1.2 Phase A — Octop 在本机立起来（已完成，全实机验证）

| 步骤 | 结果 |
|---|---|
| llama-server | `D:\qwen\llama.cpp\cuda\llama-server.exe`，Qwen3.6-35B-A3B GGUF，`127.0.0.1:18080`，`--jinja`（OpenAI 兼容） |
| Octop 安装 | `D:\claude-ecosystem\Octop-main\Octop-main` 源码运行；`uv sync --python 3.12.13-windows-x86_64-none`（**必须 uv 管的 64 位 3.12**，anaconda 和系统 python 分别是 32 位/版本不合，装不上依赖） |
| 隔离实例 | `OCTOP_HOME=D:\claude-ecosystem\octop-home`（因为 `~/.octop` 已有旧安装 venv，`octop init` 会报已存在） |
| Octop run | `127.0.0.1:8088`，`uv run octop run`；admin / `octop-local-2026` |
| provider | kind=openai，base_url=`http://127.0.0.1:18080/v1` |
| 测试 agent | `DSE30J`（name=personal），workspace 派生 `D:/claude-ecosystem/octop-playground/.octop/workspaces/DSE30J`，`tools_disabled:["execute"]` |

**踩过的坑（都记在 spike §4 复现命令里）**：
- Windows 路径在 JSON body 里必须用**正斜杠**（反斜杠触发 "Invalid \\escape"）
- `PATCH workspace_dir` 无效，workspace 只能由 create 时的 `backend.root_dir` 派生：`{root_dir}/.octop/workspaces/<agent_id>`。**要把文件喂给 agent 就得放进这个派生目录**
- MINGW bash 内联 JSON 的中文/反斜杠会被转义损坏 → 带中文的请求一律走文件/脚本

### 1.3 Phase B — 决策层与 Octop 接通（已完成代码，联调待补）

新增文件（全部在 `D:\claude-ecosystem\org-engine`）：

| 文件 | 行数 | 干什么 |
|---|---|---|
| `engine/personal/adapters/octop_http.py` | 204 | 真实 HTTP 客户端：login 换 JWT、401 重试、403→PermissionError、ensure_agent、create_thread、hitl_pending（重启恢复读 history）、trajectory 读取、run_turn（sync 包 async） |
| `engine/personal/adapters/octop_ws.py` | 313 | **核心**：`collect_turn` 驱动一轮对话 |
| `engine/personal/runner.py` | 221 | PersonalRunner：Octop WS turn + 门禁决策 + 逐回执本地磁盘验证 |
| `engine/personal/service.py` | 197 | stdlib http.server 薄壳，端口 5174：/v1/plan、/v1/execute、/v1/verify |
| `editor/backend-server/src/personal/pipeline.routes.ts` | 207 | TS 侧管线：POST /api/v1/personal/tasks/:id/run |
| 三个 `*_test.py` | 180/114/186 | 25 个单测 |

`server.ts` 已注册 `registerConfirmationRoutes` + `registerPipelineRoutes`，Octop 配置走环境变量：`OCTOP_BASE_URL` / `OCTOP_WORKSPACE_ROOT` / `OCTOP_PASSWORD` / `OCTOP_USERNAME` / `OCTOP_AGENT_NAME` / `OCTOP_ALLOW_REMOTE`。**缺失时 octop=null → 管线返回 503 `octop_not_configured`，显式降级不静默。**

### 1.4 Octop 真实行为清单（ Spike §1/§3，接手后别再重新踩）

**必知**：
1. **发消息只有 WS**：`WS /api/agents/{id}/chat/ws?token=<jwt>`，帧 `user_turn/subscribe/cancel`。没有 HTTP POST 发消息端点。
2. chunk 类型：`token / tool_call_chunk / tool_result / hitl_required / done / error / usage / state_update`。
3. **HITL 续跑 chunk 在 resume 的 SSE 响应里，原 WS 订阅收不到**；WS 流在 hitl_required 后紧跟 done。（`octop_ws.py` 已按此实现）
4. **`tool_call_chunk` 的 args 流式分片**：首块带 `id`，后续片段只带数字 `index`。**实机不同调用的 index 都从 0 开始**（不是全局序号）——所以要用 `idx_owner: dict[int, call_id]` 登记归属，不能拿 index 当下标。
5. **trajectory 持久层是有损账本**：args 只留首片段（`args:"{"`）。**完整参数只有 live 流能拿到**；`hitl_required.request.action_requests[].args` 是权威参数，用于覆盖。
6. 审批配置三层：全局 `PUT /api/admin/security`（**实测有效**）；per-agent `config_json.security`（**实测不生效，待查**）；per-turn `hitl_policy` 只能放行不能升级。
7. HITL pending 在内存 30 分钟 TTL；重启后可经 `GET .../chat/history → hitl_pending` 重建（`octop_http.hitl_pending()` 已实现，但**流程上还没人调用它**）。
8. 默认**无门禁**（`hitl.enabled=False, tool_guard=warn`）→ agent 可自由 write_file。危险面已实证。
9. 本机模型慢：prompt 12888 tokens 预填充 ~19.8 tok/s ≈ **10 分钟/回合**。turn 串行（thread execution lock）。
10. 工具表：`ls/read_file/write_file/edit_file/glob/grep/execute`；execute 可禁，**写类工具不可禁**（只能靠 HITL）。

### 1.5 Phase C — 第一个真场景（跑过一次，有 bug 已修复未复验）

场景：读 `ten_document_inbox/` 十个 doc_XX.md → 写汇总表到 `材料汇总.md`。
走 `phase_c_run.py`（在 `D:\claude-ecosystem\octop-playground\`），经 service :5174 全链路：/v1/plan → verdict=select → /v1/execute。

**首次跑结果**：`STATUS: done | OVERALL: executed_unverified | receipts: 11 | hitl: 1 | verifications: 10`
——唯一的 write_file 被门禁 **reject** 了，消息"这个操作超出了你授权的范围，没有执行。"

**根因（两个，都已修复并补了测试）**：
1. `_normalize_args` 不认 Octop HITL 的 **`file_path` 键**（`permission_gate` 只认 `path`/`target`），target 为空 → scope 检查误拒。已修：file_path 同时映射到 path/target，并剥前导 `/`。
2. `tool_call_chunk` 的 index 片段**跨调用串门**（原实现假设 index 是全局序号，实机每个调用都从 0 开始）。已修：`idx_owner` 字典登记归属。
3. 连带：args 残缺（`_unparsed_args`）一律落 `unverifiable`，绝不猜 verified。

**完整复验未做**（用户指示停止跑 Phase C，转写文档）。

---

## 2. 怎么干的（代码地图 + 设计决策）

### 2.1 数据流（一条 turn 的完整生命周期）

```text
TS pipeline.routes.ts  POST /tasks/:id/run
  → POST :5174/v1/plan   {task, rules}        → build_plan：BaselinePolicy 裁决
  ← plan.verdict: blocked / ask_user / needs_confirmation / select
  → :5174/v1/execute      {plan, rules, octop, ...}
      → PersonalRunner.run
          → OctopHttpClient.run_turn → octop_ws.collect_turn
              → WS user_turn{hitl_policy:{mode:"allow_tools", tools:[ls,read_file,glob,grep]}}
              → 读类工具直接执行；写类工具 → hitl_required
              → runner._on_hitl(gate, task_id, token):
                  action_requests[] 逐个 → CandidateAction → PermissionGate.authorize
                  → approve / reject(中文原因)
                  → hitl/resume{decisions} → 消费 SSE 续流
              → receipts：hitl_args 覆盖 > live 流累积 > None
              → 逐条 verifier 读本地磁盘核对
      ← {status, receipts, verifications, hitl_log, overall_verification}
  → evidence 落库（ev.supports=[taskId]）+ trace(kind:execution) + 终态
     verified → "verified" ; status=error → "blocked" ; 其它 → "planned"
```

### 2.2 关键设计决策（接手后别推翻）

| 决策 | 理由 |
|---|---|
| Python 侧薄 HTTP 壳 + TS 侧跑流程 | Octop 插件**不能加 HTTP 路由**（实测源码确认），决策层第一版只能独立进程 + loopback |
| 回执一律以 **live 流累积** + HITL 权威参数覆盖 | trajectory 持久层 args 有损（只留 `"{"`） |
| `overall_verification` 只有 verified/failed/executed_unverified/unverifiable，**没有 done** | 红线：绝不把"模型说完成"当证据 |
| 无 handler 时 HITL 默认 **reject** | 绝不在无人决策时放行工具执行 |
| 端口分配：5172=editor backend、5173=vite、5174=personal service | 冲突规避 |
| runner 不写 SQLite | 持久化是 TS 后端的职责（数据主权单向） |
| `run_turn` 里 `asyncio.run()`（每回合新 event loop） | 只跑单回合；**并发多回合会炸**（见 bug 清单） |

### 2.3 2026-10-18 夜新增/修改（本轮）

| 文件 | 类型 | 内容 |
|---|---|---|
| `engine/personal/envelopes.py` | 改 | `network_policy` 字段（TaskEnvelope + PlanEnvelope）+ `normalize_network_policy()`：缺省 deny，未知 mode/data_class/max_results 抛错 |
| `engine/personal/search_policy.py` | 新 | 唯一搜索裁决点：`evaluate_search()` / `contains_private_content()` / `redact_query()` / `domain_allowed()` / `required_hitl_tools()` |
| `engine/personal/search_policy_test.py` | 新 | 20 条：公开放行、隐私拒绝、网络关闭、未授权 provider、域名、ask 确认 |
| `engine/personal/search_receipts.py` | 新 | `SearchReceipt`（query_hash/脱敏 query/provider/结果 URL/请求响应 hash/外发决策）+ `search_receipt_from_receipt()` + `search_evidence_of()` |
| `engine/personal/search_receipts_test.py` | 新 | 7 条：来源 URL、原文不外泄、域名过滤、证据稳定 |
| `engine/personal/runner.py` | 改 | `_TOOL_MAP` 增加搜索类→`web_search`；`_on_hitl` 对搜索先过 network_policy；`search_decisions`/`search_receipts` 落报告；overall_verification 增加"搜索无来源 → 不 verified"红线；`run()` 新增 `network_policy` 参数 |
| `engine/personal/adapters/octop_ws.py` | 改 | `_consume` 改用总 deadline；`_sse_frame_getter` 去掉 30s 固定空闲上限 |
| `engine/personal/adapters/octop_http.py` | 改 | 新增 `run_turn_async()`；`run_turn()` 兼容已有事件循环 |
| `engine/personal/service.py` | 改 | 空 receipts → `unverifiable`；`contract_version` 校验（400 `contract_version_mismatch`）；plan 携带 network_policy；返回 search_decisions/search_receipts |
| `editor/backend-server/src/personal/task-envelope.ts` | 改 | `NetworkPolicy` 类型 + `normalizeNetworkPolicy()`，镜像 Python 语义 |
| `editor/backend-server/src/personal/pipeline.routes.ts` | 改 | `timeout_s: 30*60`（修 P0）；传 `contract_version`；envelope 带 network_policy |
| `editor/backend-server/tests/personal-pipeline.test.ts` | 新 | 5 条：超时单位、verified 落库、503 未配置、blocked 不执行、needs_confirmation 不执行 |

**设计要点（接手别推翻）**：
- 搜索工具**不进** per-turn `allow_tools`——它们必须触发 HITL，否则 query 的隐私检查
  没有执行点。代价是每次搜索都要过一次门禁。
- `web_fetch` 归入联网类（`web_fetch` 能力名），不是 `external_send`，但同样受 network_policy。
- `SearchReceipt` 的 evidence 仍用 `kind="tool_result"`（SQLite 有 check 约束），
  完整搜索字段随 trace 走；任何改 evidence kind 的改动必须同时改迁移与读取方。
- 搜索"没有来源 URL"时 `overall_verification` 强制降为 `executed_unverified`——
  这是引用可审计的硬要求，不要为了 UI 好看放宽。

### 2.4 现成的 Octop 事实来源

`editor/docs/integration/octop-live-spike.md` — 含已证事实 7 条、实测问题 4 条、HITL 门禁实测 5 条、复现命令。**改 Octop 相关代码前先读它。**

---

## 3. 哪些没做（Phase D / E + 零碎）

### 3.0 最高优先级：Gate S 一次都没跑过
审计 `org-engine-octop-integration-audit.md` 的 Gate S 是**继续产品化的硬前提**，当前状态：
- Octop 侧是否真的暴露 `searchfree_search` 给 personal agent —— **未验证**。
- 真实 Qwen WS 回合是否会调用搜索工具 —— **未知**（审计明确写了"不能假定"）。
- 三个服务（:18080 / :8088 / :5174）当前**全部已停**。
- 通过标准（3 次公开查询 + 真实 URL + 4 种失败态 + 私密 query 不外发 + 重启不重复写）
  一次都没执行。

**接手第一件事**：按计划 Task 7 跑 Gate S，日志落 `manual-qa/2026-10-18/search-spike/`。
没通过就按审计给的三条降级路径选一条，不要继续做 UI。

### Phase D — UI 接真 + 交付形态修正（**按审计要求，Gate S 通过前不得开工**）
审计已把这项工作列为 P1 缺陷（不是可选优化）：
1. `editor/frontend/src/views/PersonalApp.tsx:19-32` 的 `SAMPLE_OUTCOME` 与
   `trace_sample_01`（第 60-67 行）必须撤掉，改为：创建真实 task → 调
   `POST /api/v1/personal/tasks/:id/run` → 轮询 `GET /api/v1/personal/tasks/:id`
   → 渲染 verified/awaiting_confirmation/blocked/unverifiable。
2. `PersonalOnboardingView` 的 workspace/model/privacy/permissions 目前只进
   `localStorage`（`PersonalApp.tsx:46-53`），没有写后端 settings，也没改变 Octop
   provider/workspace。审计要求落成版本化 settings 并由后端校验一致性。
3. **Electron 独立 NSIS 安装包停止作为产品交付**（`release/` 留档即可）；
   合并产品分发以 Octop 桌面端（Wails portable）为参照，后续评估。

### Phase E — 并入 Octop 控制台（**同样后置到 Gate S 之后**）
决策层页面并入 Octop dashboard，消灭双控制台。此阶段再评估插件/自定义页机制。

### 其他未完成（与审计 Task 编号对应）
- **Task 4 的 TS 侧**：`protocol.ts` 还没有 SearchReceipt 类型与 TS 侧映射；
  Python 侧已有 `search_receipts.py`（含 golden 语义），**跨语言 golden 向量测试未写**。
- **Task 5 持久化执行**：`void executeRun(...)` 仍只在 Node 内存里；无 executions 表、
  无 lease/heartbeat、无启动恢复。并发 `/run` 仍有竞态（审计 P0）。
- **Task 6 确认令牌统一**：TS `JSON.stringify`（未排序）与 Python
  `sort_keys=True` 的 canonical JSON **不一致**；token 仍是进程内 Map，重启即失效。
- **Task 8 API 闭环**：无启动时配置校验（personal service / Octop / agent 配置），
  没有 `execution_id` 返回，重复 `/run` 不幂等。
- **`hitl_pending` 幂等恢复没接进流程**：`octop_http.hitl_pending()` 写好了但没人调用。
- **per-agent `config_json.security` 不生效的 merge 链没查**（改用全局策略绕过了）。
- **prompt 太慢的优化没做**：12888 tokens ≈ 10.7 分钟/回合；同 thread KV 缓存未实测。

---

## 4. Bug 清单（真实存在，按严重度排）

> **2026-10-18 夜更新**：B1/B2/B3/B7 与审计 P0「超时单位」已修复并配回归测试。
> 修复后的状态逐条标注在下方；未解决项保留原描述。

### B1【已修复】`asyncio.run()` 在已运行的事件循环里会炸
`OctopHttpClient` 现提供 `run_turn_async()`（纯 async）；`run_turn()` 先探测
`asyncio.get_running_loop()`，有循环时改用专用线程的独立事件循环执行。
回归测试：`octop_ws_test.SyncWrapperTest`（两种调用上下文各一条）。

### B2【已修复】SSE 固定 30 秒空闲超时
`_sse_frame_getter` 不再设 idle 上限（流关闭由 pump 放入 `None`）；`_consume` 改用
`asyncio.wait_for(..., timeout=剩余总预算)`，超时只由总 deadline 决定。
回归测试：`StreamDeadlineTest`（长空闲继续 / 总 deadline 仍截断）。

### B3【行为已明确，未改码】index 片段缺首块 id 时被丢弃
`_TurnState.observe` 只在 `cid` 非空时登记 `idx_owner`。若实机某次只有 index 片段
而首块丢了 id，该片段会被静默丢弃 → args 残缺 → unverifiable。
**这是故意的安全分支**（不可验证优于假 verified），不是漏写。若 Gate S 观察到该形态
频繁出现，再考虑按"最近未闭合调用"兜底。

### B4【低，未修】`ensure_agent` 找不到 agent 时按 name 创建，但 config 只在创建时生效
如果已存在同名 agent（如 DSE30J），`ensure_agent` 不会更新它的 backend/tools 配置。
换工作区要重新建 agent 或手动改 Octop 侧。

### B5【低，未修】`_verify_receipt` 对 `read_file` 传 `content_hash_at_read=None`
即只验"文件存在"，不验内容哈希（读时哈希根本没采）。runner_test 里 read 回执
verified 只证存在。

### B6【低，Octop 侧问题，未修】per-agent `config.security.hitl` 不生效
config 正确存储、reload 后仍不暂停。产品化要么只用全局策略，要么去查
octop-harness `SecurityPolicy.merge` 语义。
**相关部署要求**：搜索工具必须出现在 Octop **全局** HITL 工具清单里，否则
runner 的 `_on_hitl` 根本收不到搜索调用，query 隐私检查会被绕过。
`search_policy.required_hitl_tools()` 给出应纳入的工具清单。

### B7【已修复】`/v1/verify` 空结果集语义
空 receipts 现在直接返回 `overall: "unverifiable"`（不再落入 `executed_unverified`）。
回归测试：`service_test.test_verify_with_no_verifiable_receipts_is_unverifiable`。

### B8【已修复】审计 P0：`timeout_s` 单位错误
`pipeline.routes.ts` 原写 `timeout_s: 30 * 60_000`（= 18,000,000 秒 ≈ 208 天）。
已改为 `30 * 60`。回归测试：`personal-pipeline.test.ts` 断言实际收到 `1800`。

### B9【新增，待验证】搜索工具是否真被 Octop 暴露/调用 —— 未知
`_TOOL_MAP` 与 `SEARCH_TOOLS` 已覆盖 searchfree/tavily/brave/google/kimi/web_fetch，
但**没有任何实机证据**表明 personal agent 的 tool catalog 里有这些工具，或 Qwen 会调用。
这正是 Gate S 的第 1、3 步。

---

## 5. 交接时必须说的其他事（用户没提，我认为该说）

1. **服务进程现在都没起**：llama-server（:18080）、octop（:8088）、personal service（:5174）**三个进程在文档完成时都是死的**（我核过 netstat）。接手要先按 spike §4 的命令把它们拉起来，模型加载约 2 分钟。**Phase C 重验前必须先起这三个。**
2. **代码路径全在 D 盘**，没有任何东西在 C 盘（环境红线）。
3. **Python 版本陷阱**：本机默认 python（系统/MINGW）是 **32 位 3.12.1**，`websockets` 能用但别的重依赖装不上；Octop 那套用 uv 的 64 位 3.12.13。**engine/personal 的测试我是在哪个解释器下跑的——25 个单测用 `python`(3.12.1 32位) + PYTHONPATH=. 全过**，接手先用同样命令确认：
   ```bash
   cd /d/claude-ecosystem/org-engine/engine && PYTHONPATH=. python -m unittest personal.adapters.octop_ws_test personal.runner_test personal.service_test
   ```
   （注意：`learn.proposer_test/signals_test/versioning_test` 在 discover 时报 loader 错误，但那是因为 discover 的导入路径，单独跑 `personal.learning.proposer_test` 是 OK——历史遗留噪音，不是我引入的。）
4. **测试计数口径（2026-10-18 夜更新）**：
   - Python（在 `engine/` 下，`PYTHONPATH=. python -m unittest discover -s personal -p "*_test.py" -t .`）
     → **327 passed**。聚焦六套（octop_ws/runner/service/envelopes/search_policy/search_receipts）
     → **85 passed**。
   - TS 后端（`editor/backend-server && npx vitest run`）→ **238 passed / 38 files**。
   - TS 前端（`editor/frontend && npm test`）→ **64 passed / 10 files**。
   - 早期 `discover` 报的 learning 三个 loader 错误现已消失（用 `-t .` 修正了导入根）；
     若再出现，先确认命令是否带 `-t .`。
   - **注意**：`npx tsc --noEmit` 在 backend 有 8 条**历史遗留**类型错误
     （`learning/apply.ts`、`learning/routes.ts`、`personal/evidence.ts`、`personal/store.ts`），
     与本次改动无关，未修——不要误以为是你弄坏的。
5. **Phase C 报告已落盘**：`D:\claude-ecosystem\octop-playground\phase_c_report.json`（首跑、含误拒那次），`phase_c_run.py` 是复跑入口。工作区残留的 `材料汇总.md` 我已清掉（那是误拒前 agent 尝试写的部分内容）。
6. **LLM 侧 provider 是可切换配置项**，现在指向本机 llama-server；原计划保留"先本地后 API 代理"的路线，provider 是 `kind=openai` + `base_url`，随时可改。
7. **不要把 Octop 的 Connector/IM/Memory/浏览器能力复制进 Org Engine**（结合方案 §4 停止事项）。执行全走 Octop。
8. **octop.routes.ts 仍是死代码**（`server.ts` 从未注册 `registerOctopRoutes`）。这次没碰它——它服务的是已废弃的"双控制台"思路。接手如果做 Phase E 可以考虑是否还要它。
9. **Windows 上 `uv run octop` 和 service 一定要分开终端后台跑**，phase_c 首跑时我是用后台 shell 起的（`b2cyzpgcz` / `b8qytqs83` 之类的 task id，新会话要重新起）。

---
