# 个人助理 MCP 安全面（P9.2）

`backend-server/src/mcp/mcp-stdio.ts --surface personal` 启动个人安全面；
默认 `--surface org` 保留开发者编排工具，互不影响。

## 只暴露五个工具

| 工具 | 语义 | 是否有执行路径 |
|---|---|---|
| `list_tasks` | 列出个人事项 | 只读 |
| `get_task` | 读取一个事项及其 trace 引用 | 只读 |
| `get_evidence` | 读取一条证据记录 | 只读 |
| `simulate_task` | 沙盒模拟，只返回计划 | 无——永不执行 |
| `propose_action` | 记录一个动作提案 | 无——回复带 `will_not_execute: true` |

## 为什么 MCP 客户端不能绕过 RuleEngine 或确认 token

1. **发送、删除、付款、提交不存在工具条目**——不是"调用被拒绝"，而是
   `tools/list` 里根本没有这些名字；调用它们得到 `Unknown tool`。
2. `propose_action` 的入参里**没有确认 token 的位置**；token 只在应用内
   HTTP 确认链路（permission gate）流转，且与 (task_id, action_id,
   parameters_hash) 单次绑定。
3. MCP 层的 `simulate_task` 只有沙盒语义，从不触碰真实工作区。

## 调用约定

- 每个调用必须携带 `scope: {user, session}`，缺一则拒绝（ScopeError）。
- 每个成功响应都包含 `trace_id` 与 `evidence_refs`，保证可追溯。
- 默认 HTTP 执行器转发到后端 `/api/v1/personal/*`；测试可注入
  `PersonalMcpExecutor`。

## 测试

`tests/personal-mcp.test.ts` 使用**真实 MCP client**
（`@modelcontextprotocol/sdk` Client + InMemoryTransport，与 stdio 同协议）
覆盖 initialize、tools/list、scope 拒绝、模拟、提案无执行、危险工具不存在。
