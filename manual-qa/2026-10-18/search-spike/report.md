# Gate S 结果 — 2026-10-23/24

## 结论：**未通过（但失败原因与隐私无关）**

## 环境

| 项 | 值 |
|---|---|
| llama-server | `:18080`，Qwen3.6-35B-A3B GGUF，`--jinja` |
| Octop | `:8088`，`OCTOP_HOME=D:\claude-ecosystem\octop-home` |
| personal service | `:5174`（Task 5/6 修复版） |
| agent | `DSE30J`（name=personal） |
| thread | `thr_01M5NW9ZFMND9X8X5FQN6K9BRE` |

## 已确认为真的部分

1. **`agent_preflight` 发现了真实的安全缺口。** 实测 agent 挂载了
   **8 个搜索/抓取类工具**（`brave_search`、`google_search`、`kimi_search`、
   `searchfree_search`、`tavily_search`、`web_fetch`、`memory_search`、
   `search_knowledge`），而全局 HITL 只有 `["edit_file", "write_file"]`。
   这是 Task 6 修复前的实际状态——**所有搜索工具都会绕过隐私门禁直接执行**。
2. **`ensure_hitl_tools` 生效。** 调用后 HITL 变为
   `["write_file","edit_file","searchfree_search","tavily_search","brave_search","google_search","kimi_search","web_fetch"]`。
3. **reload + preflight 通过。** `agent_preflight(..., gate_all_search_tools=True)`
   返回 `ok=True`、`outside_hitl=[]`。
4. **模型确实会调用搜索工具。** trajectory 证据（seq=14）：
   ```
   name: searchfree_search
   args: {"url":"https://docs.python.org/3.12/whatsnew/3.12.html","timeout":15}
   ```
   且 `searchfree_search` 的返回里含真实 URL。

## 失败原因

第一次查询 **超时（1430 秒 / 30 分钟上限）**，且 `has_urls=False`。

根因链条（trajectory seq 14→21）：

```
seq 14  searchfree_search  → 返回 docs.python.org 的 URL
seq 16  web_fetch          → "Tool result too large"
seq 17  web_fetch          → "Tool result too large"
seq 18  read_file          → 读取 .octop/large_tool_results/2gfm5Jx8xsL1TUQ...
seq 19  read_file(文件)    → 继续读
seq 21  ...                → 30 分钟耗尽
```

**这不是隐私问题，是工具链问题**：
- `web_fetch` 抓整个 HTML 页面 → 触发 "Tool result too large"
- Octop 把超大结果落盘到 `.octop/large_tool_results/`，让模型改用 `read_file` 分页读
- 模型于是陷入「读大文件」循环，把 30 分钟预算耗尽

## 性能数据（必须记录）

| 指标 | 实测值 |
|---|---|
| prompt 规模 | **19,078 tokens**（40 个工具 + harness 系统提示） |
| prefill 速度 | **13.5 tok/s** |
| 单次 prefill 耗时 | **~24 分钟** |
| 单 token 生成 | 222 ms（4.5 tok/s） |
| 第一次查询总耗时 | 1430 秒（超时） |

这比 10-17 spike 记录的 12,888 tokens / 19.8 tok/s / 10.7 分钟**更慢**，
因为 Task 6 把 5 个搜索工具纳入了 agent 的工具目录。

## Gate S 判定

| 通过标准 | 结果 |
|---|---|
| 3 次独立公开查询成功 | ❌ 第 1 次超时，第 2/3 次未跑（人为停止） |
| 每次都有真实 tool event | ✅ 第 1 次有（seq=14） |
| 每次都有来源 URL | ❌ searchfree 回包里有 URL，但 `search_receipt_from_receipt` 未提取到（回包形态不是 `{results:[...]}`） |
| SearchReceipt 落盘 | ❌ 同上 |
| 非伪造引用 | — 未到该步 |
| 四个失败态可区分 | 未执行 |
| 无私密 query 外发 | 未执行 |
| 重启不重复写入 | 未执行 |

**Gate S = FAIL（1/8 通过）**

## 下一步（按审计的降级路径）

审计给了三条降级路径，这里选 **路径 1：确定性 pre-search**，理由是：

1. **`searchfree_search` 的参数签名不是 `query`。** 实测模型传的是
   `{"url": "...", "timeout": 15}`，说明这个工具的入参与我们假设的
   `{"query": "..."}` 不同。`search_receipt_from_receipt` 按 `query` 取，
   取不到 → `query_hash` 是空串的哈希 → 结果解析也走不到 `results` 分支。
   **必须先修 receipt 提取逻辑**。
2. **`web_fetch` 会把大页面落盘**，模型没有能力高效处理，必然耗尽预算。
   Gate S 的验收对象是「搜索可审计」，不包括「网页正文可读」。
3. 本地 4.5 tok/s 的生成速度 + 24 分钟 prefill，不适合做多轮 agentic 搜索。

### 具体修正项（下一轮 Gate S 前必须完成）

1. **修 `search_receipt_from_receipt` 的 args 解析**：读
   `octop_harness/builtin/tools/web_search/searchfree.py` 确认真实签名，
   按真实字段名取 query。
2. **修结果解析**：确认 `searchfree_search` 的返回值形态（是字符串还是
   `{results:[...]}`），按实际形态提取 URL。
3. **Gate S 测试时禁用 `web_fetch`**：在 agent 的 `tools_disabled` 里加
   `web_fetch`，或在 HITL 里对它一律 reject，避免模型进入大文件读取循环。
4. **降低 prompt 规模**：`tools_disabled` 关掉不用的工具（40 个 → 目标 <15），
   否则每回合 24 分钟不可接受。
5. 重跑 Gate S，日志存 `gate-s-runs-v2.json`。

## 原始证据

- `gate-s-runs.json`：只含第 1 次（timeout）的记录
- Octop server log、llama-server log 见任务输出目录
- trajectory thread：`thr_01M5NW9ZFMND9X8X5FQN6K9BRE`

---

## 追加发现（2026-10-24）

### D1【严重】`timeout_s` 到期不会取消 Octop 侧的 turn

第一次查询 1430 秒超时后，`collect_turn` 返回 `status: "timeout"`，客户端断开 WS。
但实测 `GET /api/agents/DSE30J/threads/thr_01M5NW9ZFMND9X8X5FQN6K9BRE/history`
仍返回 `turn_active: true`。

**后果**：
1. 后端模型继续生成，持续占用 GPU/CPU；
2. 同一 agent 的后续 turn 与残留 turn 并行，llama-server 出现
   `slot id 1` 和 `slot id 2` 同时 prefill，速度从 13.5 tok/s 掉到 **3.27 tok/s**；
3. 第二次查询的 prefill 时间因此翻倍。

**修复方向**（未实现）：
- `collect_turn` 超时后应调用 `POST /api/agents/{id}/chat/cancel`（若存在）
  或 `POST /api/agents/{id}/stop` + `start`；
- 或 `executeRun` 的 catch 分支检测 `status === 'timeout'` 时主动停 agent；
- 在没有取消 API 的情况下，至少要在 `timeout_s` 到期后把该 execution 标为
  `recoverable`（Task 4 已做）并阻止同一 agent 立刻接新 turn。

### D2【严重】`searchfree_search` 是外部单点，且会瞬时失败

同一端点：
- 直接 httpx 调用 → `200` + 正常 JSON
- 通过 Octop 工具调用 → `Error: searchfree request failed: Server disconnected without sending a response.`

说明失败是瞬时的（可能并发/超时/被限流）。模型收到错误后会改用 `web_fetch`
直接抓 URL，进而触发 "Tool result too large" 循环。

**影响 Gate S**：无法稳定通过"3/3 查询都有来源 URL"。

### D3【已缓解】`web_fetch` 会导致 30 分钟预算耗尽

已在 agent 的 `tools_disabled` 中加入 `web_fetch`（40 → 38 工具）。
Gate S 复跑时必须保持禁用。

### D4【性能】prompt 仍有 14,000+ tokens

即使禁用了 `web_fetch`，工具目录仍有 38 个，prompt 约 19,000 tokens。
prefill 需要 **~20 分钟**（13.5 tok/s）。

**Gate S 若要用真实模型，必须先把工具数降到 15 以下**：
`tools_disabled` 关掉 memory、知识库、媒体、cron、ACP 等无关工具。

### D1、D2 已修复（2026-10-24）

| 缺陷 | 修复 | 测试 |
|---|---|---|
| D2 `searchfree_search` 返回 JSON **字符串**，`_iter_results` 只认 dict/list → 永远提取不到 URL | `_iter_results` 增加字符串分支：`json.loads` 后再解析；`Error:` 前缀和非 JSON 文本返回空列表 | `search_receipts_test` +3（`test_parses_json_string_result`、`test_error_string_yields_no_results`、`test_non_json_string_yields_no_results`） |
| D1 `timeout_s` 到期不取消后端 turn，导致残留 turn 抢算力 | `collect_turn` 在 `state.status == "timeout"` 时向 WS 发送 `{"type":"cancel","thread_id":...}` 再断开 | `octop_ws_test.test_timeout_sends_cancel_frame` |

Python 全量：**378 passed**（原 374 + 4）。

### Gate S 仍未通过的项目

修复后仍需重跑才能判定：
- 3/3 查询有真实来源 URL（依赖 searchfree 端点稳定性）
- 四个失败态可区分
- 隐私 canary 不外发
- 重启不重复写入

### 重跑前必须做的准备

1. **把 prompt 压到 15k 以下**：`tools_disabled` 关掉 memory / 知识库 / 媒体 / cron / ACP。
   当前 38 个工具 → prompt ~19k tokens → prefill ~20 分钟。
2. **保持 `web_fetch` 禁用**（已在 agent config 里）。
3. **确认 searchfree.site 可用**：`curl -X POST https://searchfree.site/api/search -d '{"query":"test"}'`。
4. **每次查询前确认 `turn_active: false`**，避免残留 turn 并行。
