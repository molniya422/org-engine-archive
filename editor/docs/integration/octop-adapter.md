# Octop 执行 adapter（P4.4）

## 入口选择

走 **HTTP/进程内协议映射**（spike 结论的最小稳定入口）。Octop 版本在 spike 时记录为
`1.0.2b5`（`pyproject.toml [project] version`）。adapter 常量
`OCTOP_PROTOCOL_VERSION = "1.0.2b5"`；版本不一致 → `OctopVersionMismatch`（可恢复，
绝不跨版本猜测）。

## 协议映射

| Org Engine 调用 | Octop 端 | 携带字段 |
| --- | --- | --- |
| `list_sessions()` | 会话列表 | protocol_version 校验先行 |
| `read_tool_receipt(id)` | 工具回执读取 | — |
| `propose_tool_action(plan, candidate, token)` | ActionProposal | `trace_id`、`contract_version`、`policy_version`、`expected_token` |
| `execute_approved_action(proposal_id, token)` | 执行已批准动作 | `confirmation_token`（对齐 spike 缺口 G1） |
| `verify_receipt(plan, receipt)` | —（Org Engine 内部） | 回执 → `VerificationEnvelope` |

## 数据流红线

1. **回执先 verifier，后合同**：`execute` 的返回值只是 receipt；必须经
   `verify_receipt()` 产出 `VerificationEnvelope`（verified / failed /
   unverifiable），才允许更新 TaskContract。receipt 本身永远不直接当完成证据。
2. **规则先于 Octop**：用户规则禁止的 kind（如 `external_send`）在
   `propose_tool_action` 之前就抛 `OctopPermissionDenied` —— 动作根本不进 Octop。
   高风险动作必须携带正确 confirmation token，否则 Octop 侧拒绝。
3. **数据主权单向**：adapter 只读 Octop、只发提案/执行请求；从不写 Octop 的数据库。

## 可恢复状态映射

| 故障 | 异常 / HTTP | 恢复方式 |
| --- | --- | --- |
| 连接失败 | `OctopConnectionError` / 503 `recoverable:true` | 稍后重试 |
| 版本不兼容 | `OctopVersionMismatch` / 409 | 升级一侧后再试 |
| 权限拒绝 / token 无效 | `OctopPermissionDenied`、`PermissionError` / 403 `needs_reconfirmation` | 重新走确认流程 |
| 用户规则禁止 | 403 `recoverable:false` | 不执行（规则是硬的） |

## 测试

- `engine/personal/adapters/octop_test.py` — 10 项：低风险端到端、高风险 token、
  规则前置拦截、连接/版本可恢复、verifier 前置、失败回执映射。
- `editor/backend-server/tests/octop-routes.test.ts` — 4 项：路由映射、token 贯穿、
  403/503 状态映射（fake transport）。

验收达成：**Org Engine 可以使用（fake）Octop 执行一个低风险本地任务；高风险动作
不能绕过 Org Engine 的确认和验证。** 隔离实例测试待 Octop 实装后补（同 spike 的
fixture 驱动方式）。
