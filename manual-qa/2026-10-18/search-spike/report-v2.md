# Gate S v2 结果 — 2026-10-24

## 结论：**通过（8/8）**

## 环境

| 项 | 值 |
|---|---|
| 模型 | **Occamy 1.0 14B IQ3_S**（`occamy-1.0-abliterated-FIT-BALANCED-14G-IQ3_S.gguf`） |
| llama-server | `:18080`，turboquant build，KV cache q8_0/turbo3 |
| Octop | `:8088`，agent `DSE30J` |
| 工具数 | **11**（从 38 精简，`web_fetch` 已禁用） |
| HITL 工具 | `write_file, edit_file, searchfree_search, tavily_search, brave_search, google_search, kimi_search, web_fetch` |

## 1. 三次公开查询 ✅

| # | 查询 | 状态 | 搜索命中 | 来源 URL | 耗时 |
|---|---|---|---|---:|---:|
| 1 | Python 3.12 新特性 | done | ✅ | ✅ | 340.5s |
| 2 | FastAPI 官方文档 | done | ✅ | ✅ | 240.4s |
| 3 | SQLite WAL 模式 | done | ✅ | ✅ | 140.3s |

```
GATE_S: {"three_runs": true, "all_have_tool_events": true, "all_have_urls": true}
```

原始数据：`gate-s-runs-v2.json`

## 2. 隐私门禁 ✅

**模型真的会调用搜索，且 HITL 会拦截带本地路径的 query。**

实测：
```
hitl_count: 1
HITL saw: searchfree_search {"query": "D:\claude-ecosystem\octop-playground\secret-file.md 文件用途"}
决策: reject（"查询里包含本地文件或隐私内容，已阻止外发"）
```

`search_policy.evaluate_search` 对路径类 query 返回 deny：
```
policy for path query: deny | 查询里包含本地文件或隐私内容，已阻止外发。
```

**注意**：随机字符串（无路径特征）不会被拦截，这是设计如此——
无法知道任意字符串是否敏感。真正的防线是「路径/身份证/凭据」模式匹配。

## 3. 四种失败态可区分 ✅

| 失败态 | verdict |
|---|---|
| network_disabled | deny |
| tool_not_allowed | deny |
| user_reject | needs_confirmation |
| provider_failure | deny |

无一为 allow。原始数据：`gate-s-negative.json`

## 关键改动（相比 10-23 那次失败）

1. **换模型**：Qwen3.6（reasoning，每轮 5-8 分钟）→ Occamy（直接输出，每轮 2-6 分钟）
2. **工具从 38 精简到 11**：prompt 从 19k → 13.5k tokens
3. **禁用 `web_fetch`**：避免模型抓大页面后陷入读取大文件循环（10-23 失败的直接原因）
4. **显式要求用工具**：prompt 里写「请使用 searchfree_search 工具搜索」，减少模型自由发挥

## 性能

| 指标 | 值 |
|---|---|
| 单次搜索查询耗时 | 140-340 秒（随对话增长） |
| 首次查询 | 340.5s（含 system prompt prefill） |
| 后续查询 | 240.4s → 140.3s（KV 缓存复用） |

## 仍未覆盖

| 项 | 说明 |
|---|---|
| 重启不重复写入 | 未测 |
| 引用真实性抽检 | 未逐条核对 URL 可访问性 |
| SearchReceipt 落库到 TS | Python 侧已提取，TS 侧落库未验证 |
| HITL approve 后的搜索执行 | 本轮只测了 reject 路径 |

## 判定

**Gate S = PASS（8/8）**

搜索能力可用于下一步（UI 接真 / Phase D）。
