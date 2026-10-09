# Octop Compatibility Spike — P0.6

- **日期**: 2026-10-09
- **分支**: `p0-baseline-2026-10-09`
- **范围**: 协议层 spike，不启动 Octop 服务、不修改 Octop 源码、不安装 Octop 依赖。
- **方法**: 只读源码 zip `D:\claude-ecosystem\Octop-main.zip`（4271 文件）确认协议面，用 fixture 驱动完成「接收回执 -> 规则判断 -> 生成模拟动作 -> 保存 trace」的闭环演示。规则判断 / 模拟动作 / trace 保存由 PersonalDecisionProtocol 的映射层预留，RuleEngine / Verifier / trace 持久化在 P3/P4/P5 实现。
- **上游计划**: `editor/docs/superpowers/plans/2026-10-04-local-personal-decision-assistant-plan.md` P0.6、P4.4。

## 1. Octop 现状

| 项目 | 状态 |
| --- | --- |
| 安装 | 未安装，未运行。仅有源码 zip（24MB，4271 文件） |
| 版本 | `octop 1.0.2b5`（`pyproject.toml` `[project] version`） |
| 语言/框架 | Python ≥ 3.12，FastAPI ≥ 0.110，pydantic ≥ 2.6,<2.14 |
| 运行依赖（记录，不安装） | octop-harness / octop-memory / octop-gateway / octop-browser ≥ 1.0.0，langchain-core，mcp ≥ 1.9,<2，playwright，psycopg[binary]，langgraph-checkpoint-postgres，apscheduler，fastapi/uvicorn 等 |
| 存储 | PostgreSQL（psycopg + langgraph-checkpoint-postgres），另有可插拔 workspace（本地目录/Docker/COS/S3） |
| 模型 | 本地模型或 API（模型路由、上下文执行） |

## 2. 已确认协议面（只读源码确认）

### 2.1 回执载体 — `TrajectoryEvent`

`src/octop/infra/history/trajectory/types.py`（`@dataclass(frozen=True)`）：

```
event_id: str
thread_id: str
agent_id: str
seq: int
ts: float
kind: Literal["user","assistant","tool","context","compacted","system","unknown"]
turn_id: str | None
request_seq: int | None
is_error: bool
summary: str
payload: dict[str, Any]
```

**工具事件约定（来自 `trajectory/projector.py`）**：`tool` 事件通常带
`payload = {"call_id": ..., "name": ..., "args": ...}`（工具调用）或
`payload = {"call_id": ..., "name": ..., "result": ...}`（工具结果）。
一次工具调用 = 两条独立 `tool` 事件，靠 `payload.call_id` 关联。
`payload` 是 `dict[str, Any]`，**无强约束 schema**——协议层必须容错。

### 2.2 REST 端点

`src/octop/api/routers/chat/trajectory.py`，全部受 `Depends(current_user)` 保护：

| 端点 | 返回 | 说明 |
| --- | --- | --- |
| `GET /agents/{agent_id}/threads/{thread_id}/trajectory` | `TrajectoryHistoryOut` | 列表：`next_before_seq` / `has_more`；省略 `content/text/thinking`，`args/result` 截断到 2000 字符 |
| `GET /agents/{agent_id}/threads/{thread_id}/trajectory/events/{event_id}` | `TrajectoryEventOut` | 单条详情：完整 payload（未截断） |
| `GET /agents/{agent_id}/threads/{thread_id}/trajectory/metrics` | `TrajectoryMetricsOut` | 聚合指标（turns/steps/durations/tokens） |
| `GET /agents/{agent_id}/threads/{thread_id}/trajectory/stream` | SSE | `after_seq` 回放 + 实时跟随 |
| `GET /agents/{agent_id}/threads/{thread_id}/trajectory/export` | jsonl/json | 完整 payload 导出 |

### 2.3 鉴权

Router 使用 `Depends(current_user)`（`src/octop/api/deps.py`）：需要 Octop 的用户会话/token。
P4.4 的 adapter 需要先取得 Octop 侧会话凭证，再把 `as_user` / user token 透传。

### 2.4 本次协议交付物

- `editor/backend-server/src/personal/protocol.ts` — TS 侧映射（`PROTOCOL_VERSION = "1.0.0"`）
- `engine/personal/protocols/octop.py` — Python 侧同构映射（字段名一致）
- `editor/docs/integration/fixtures/octop-tool-receipt.json` — 回执 fixture（成功/失败/用户取消）

映射链：

```
TrajectoryEvent(kind="tool")
  -> OctopToolReceipt / ToolReceipt
  -> PersonalEvidence (kind="tool_result")
```

- `locator = octop://trajectory/{agent_id}/{thread_id}/{event_id}`（不透明引用，指向 Octop 回执）
- `content_hash = sha256:<hex>`，canonical 序列化（键递归排序、无空白、UTF-8），TS/Python 结果一致
- `captured_at = ISO8601 UTC`（秒精度，尾缀 `Z`），由 `ts`（epoch 秒）转换
- `sensitivity = "normal"`（P5 由工具 kind / scope 推导）；`supports = []`（RuleEngine 后续填充）

## 3. 协议缺口清单

| # | 缺口 | Octop 现状 | Org Engine 需要 | 协议层弥补（本次 / P4.4） |
| --- | --- | --- | --- | --- |
| G1 | 确认 token | `TrajectoryEvent` 与 trajectory 端点均无 confirmation token 字段；确认状态在 Octop 审批/护栏内部，不进入回执 | 每次 propose/execute 请求必须携带 `confirmation_token`；ActionProposal 状态机含 proposed/approved/executed/rejected | token 由 Org Engine 生成并保存在自己的 `DecisionTrace`，执行时作为请求参数传给 Octop 回执；Octop 不需要理解 token，关联由 Org Engine 用 trace_id 完成。协议为回执预留 `extras` 扩展位（本次未实现） |
| G2 | 动作审批（propose/approve） | trajectory 端点只读；spike 未确认 propose/execute 动作入口（P4.4 需在 ACP/MCP/HTTP 中选一个最小稳定入口并记录版本） | `ActionProposal` 生命周期 + 用户一次性确认 | P4.4 的 `octop.py` adapter 实现 propose/approve/execute 映射；本次只把 `ActionProposal` 的映射形状写在协议注释里，不实现 |
| G3 | 执行回执与动作一一映射 | 一次工具调用是两条 `tool` 事件（call 带 `args`、result 带 `result`），靠 `payload.call_id` 关联；`call_id` 无全局唯一约束 | 每个执行必须能反查到唯一 `action_id` + trace | 映射层以 `call_id` 为 `execution_ref`（缺失降级为 `event_id`）；P4.4 在 propose 时注入 Org Engine 的 `action_id`，回执按 call_id/action_id 关联 |
| G4 | 执行环境标识 | 回执只有 `agent_id`/`thread_id`，无执行环境（本地目录/Docker/browser profile）标识；环境在 Octop workspace 配置内 | `Evidence.locator` 要能定位确切来源；`TaskContract.allowed_scopes` 要绑定环境 | 本次 `locator` 用 `octop://trajectory/...` 不透明引用；P4.4 adapter 从 Octop workspace 配置读取环境并附加到回执 `extras.scope_env` |
| G5 | workspace scope 约束 | workspace 是 Octop 概念，trajectory 端点不暴露 scope；文件工具 `args.path` 是执行时路径，未标注 scope | `TaskContract.allowed_scopes` 要约束工具参数，越界读/写必须拒绝 | 协议层把 `args.path` 等保留给 P5 scope checker 校验；P5.1 工具注册表把 scope 映射落地 |
| G6 | payload schema 未强约束 | `payload: dict[str, Any]`，无 schema；list 端点还会裁剪 `args/result` 到 2000 字符、省略 `content/text/thinking` | 回执字段可稳定解析、可校验 | 映射层容错（缺 name→""、缺 args/result→null）+ 非法输入抛 `ProtocolMappingError`；P4.4 建议优先用 detail/export 端点拿完整 payload |
| G7 | 取消语义 | 无显式 cancelled 状态；用户取消表现为 `is_error=true` + 无 result 的 `tool` 事件 | 区分 success / failed / cancelled；取消不得计入「执行完成」 | 本次降级规则：`is_error=true && result==null` → cancelled；P4.4 verifier 再细化判定 |

## 4. 权限模型差异

| 维度 | Octop | Org Engine |
| --- | --- | --- |
| 身份 | `current_user` 用户会话/token；每个 trajectory 端点强制登录 | 事务级意图/规则上下文，非会话级身份 |
| 工具把关 | 工具护栏：工具审批、Shell guard、身份隔离，运行时把关 | RuleEngine：硬约束、权限、敏感操作、预算，决策层把关 |
| 确认 | 审批在 Octop 内部，不留痕到 Org Engine | ActionProposal 一次性确认，确认 token 存 Org Engine trace |
| 组合关系 | — | 高风险动作必须**同时**满足 Octop 工具护栏 + Org Engine 个人规则 |

两套权限模型不互相替换：Octop 管「会话级身份 + 工具级护栏」，Org Engine 管「事务级决策 + 动作级确认」。

## 5. 版本兼容

- Octop `pyproject.toml`（spike 时读取）：`version = "1.0.2b5"`，`requires-python = ">=3.12"`
- 关键依赖钉住版本：`fastapi>=0.110`、`pydantic>=2.6,<2.14`、`mcp>=1.9,<2`、octop-* 全家桶 `>=1.0.0`
- P4.4 adapter 需在运行时记录 Octop 实际安装版本，做兼容性检查；版本不匹配映射为可恢复状态。

## 6. 数据主权（单向）与闭环演示

数据归属（计划 §2.1）：

```
Octop session / tool receipt -> PersonalDecisionProtocol -> Org Engine
Org Engine policy / evidence / confirmation -> approved action
Octop executor -> verified receipt
Org Engine trace / learning proposal
```

- **Octop 是会话、连接器凭证、工具调用和执行回执的唯一来源。**
- **Org Engine 是个人规则、决策 trace、证据索引、回归集和学习提案的唯一来源。**
- 两边只通过版本化协议传递引用和回执，**不互相直接写数据库**（本 spike 的 TS 与 Python 模块均只读回执、只写 Org Engine 侧证据映射，不写 Octop DB）。
- Octop 不可用时，Org Engine 仍可查看规则、历史 trace、回放和离线草稿。

闭环（本次 fixture 驱动）：`octop-tool-receipt.json`（3 条回执）→ `toToolReceipt/toPersonalEvidence` → Evidence 形状，供 P3 RuleEngine / P4 trace 消费。测试见下方两条命令。

## 7. 下一步 P4.4 Octop execution adapter（只列，不实现）

1. 为 Octop MCP、ACP 或 HTTP 选择一个最小稳定入口，并记录版本。
2. 实现 list sessions、read tool receipt、propose tool action、execute approved action 的协议映射。
3. 每次请求附带 contract_version、policy_version、trace_id 和 confirmation token。
4. Octop 返回的执行结果必须先进入 Org Engine verifier，再更新 TaskContract。
5. 连接失败、版本不兼容和权限拒绝分别映射为可恢复状态。
6. 用 fake Octop adapter 和隔离实例分别测试。

涉及文件（届时）：`engine/personal/adapters/octop.py`、`engine/personal/adapters/octop_test.py`、`editor/backend-server/src/personal/octop.routes.ts`、`editor/docs/integration/octop-adapter.md`，并修改 `engine/personal/envelopes.py` 与 `editor/backend-server/src/personal/task-envelope.ts`。

## 8. 验证命令（本次 spike）

```powershell
cd editor/backend-server
npm test -- personal-protocol

cd ../..   # org-engine 根
PYTHONPATH=engine D:/jiqixuexi/anaconda/python.exe -m pytest engine/personal -q
```
