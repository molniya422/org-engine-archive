# 端到端联调记录 — 2026-10-24

目的：验证 Task 1/4/5/9/10 的代码在**真实服务**上是否真的串起来。
不依赖模型速度的部分已全部验证通过；完整 turn 受本地模型性能限制。

## 环境

| 服务 | 端口 | 状态 |
|---|---|---|
| llama-server | 18080 | ✅ 运行 |
| Octop | 8088 | ✅ 运行 |
| personal service | 5174 | ✅ 运行（Task 5/6 版本） |
| backend | 15173 | ✅ 运行（`ORG_ENGINE_HOME=manual-qa/2026-10-23/home`） |

## 已通过的验证

### 1. readiness（Task 10）✅

```json
GET /api/v1/personal/readiness
{
  "ready": true,
  "checks": {
    "personal_service": {"ok": true, "detail": "ok"},
    "octop": {"ok": true, "detail": "ok"},
    "workspace": {"ok": true, "detail": "D:/claude-ecosystem/octop-playground"}
  },
  "reason": "ready"
}
```

### 2. 孤儿路由真的挂载了（Task 1）✅

之前这 7 个模块从未 import，全部 404。实测：

| 端点 | 响应 |
|---|---|
| `GET /api/v1/personal/model/health` | `{"provider":"none",...,"ok":false,"detail":"未配置本地模型..."}` |
| `GET /api/v1/personal/learning/proposals` | `{"proposals":[]}` |
| `POST /api/v1/personal/rules/:id/check` | `{"outcome":"allow","matched":[],"reason":"no user rule restricts this action"}` |

### 3. TS → Python 转发（Task 1 + Task 5）✅

| 端点 | 结果 |
|---|---|
| `POST /api/v1/personal/eval/run` | `{"report":{"ready":false,"ready_state":"not_ready","total":1,"failures":1,...}}` — 正确识别 `must_not_do` 违规 |
| `POST /api/v1/personal/simulate` | `{"simulated":true,"status":"simulated","action_diff":[...],"note":"这是模拟运行..."}` |

### 4. 并发 /run 幂等（Task 4）✅

两个并发请求返回**同一个** `execution_id`：

```
{"error":"...","execution_id":"exec_cdbfd7fcf04146c2"}
{"error":"...","execution_id":"exec_cdbfd7fcf04146c2"}
```

（当时的 error 是下面 D1 的 bug，但幂等本身是对的。）

### 5. 完整 plan 链路（修复 D1 后）✅

```
POST /api/v1/personal/tasks/task_e2e_verify2/run
→ {"plan":{"verdict":"select","selected_action":"task_e2e_verify2_a0",
          "reason":"selected draft (risk medium)","network_policy":{"enabled":false,"mode":"deny",...}}}
```

任务进入 `running`，plan trace 落库，execution 记录创建。

## 发现并修复的缺陷

### D1【Critical】`confirmation_token` 被塞进 `TaskEnvelope`

**现象**：
```
{"error":"decision_service_unreachable",
 "detail":"personal service /v1/plan -> HTTP 500: TypeError:
           TaskEnvelope.__init__() got an unexpected keyword argument 'confirmation_token'"}
```

**根因**：`pipeline.routes.ts` 的 `startRun` 把 `confirmation_token` 展开进了 envelope 对象，
而 envelope 整体作为 `task` 发给 `/v1/plan`，Python 侧 `TaskEnvelope(**body["task"])` 直接 TypeError。

**影响**：**所有任务的 plan 都会失败** —— 整条管线从未真正跑通过。

**修复**：`TaskEnvelope` 只装合同本身；`confirmation_token` 作为独立参数一路传到
`executeRun` / `dispatch` / `run_spec`。

**这是纯单测发现不了的**：`personal-pipeline.test.ts` 的 stub 服务接受任意 body，
所以 12 个测试全绿，但真实 Python 服务会拒。

### D2【Important】错误详情被丢弃

**现象**：trace 里只有 `personal service request failed (/v1/execute)`，无法定位。

**根因**：`catch` 里只取 `e.message`，丢掉了 `ServiceUnavailableError.detail`。

**修复**：`msg = message + ' — ' + detail`。

### D3【Important】超时配置卡在边界

**证据**（Python service 侧日志）：

```
Exception occurred during processing of request
  File "personal/service.py", line 266, in do_POST
    self._json(200, execute(body["plan"], body))
  ...
ConnectionAbortedError: [WinError 10053] 你的主机中的软件中止了一个已建立的连接
```

Python **已经跑完整个 execute 并准备返回 200**，但 TS 侧已断开。

**实测时间**：
- prompt 15,619 tokens
- prefill 约 25 分钟（13 tok/s）
- 生成 259 tokens / 40 秒
- **总计超过 35 分钟的 fetch 超时**

**修复**：
- `timeoutMs`: 35 分钟 → **60 分钟**
- `LEASE_MS`: 35 分钟 → **60 分钟**
- `timeout_s`: 30 分钟 → **55 分钟**

## 仍未验证的部分

| 项 | 原因 |
|---|---|
| 完整 turn 到 `verified` | 需要 40+ 分钟/回合，且受本地模型速度限制 |
| HITL 审批在真实链路中触发 | 依赖完整 turn 走到 write_file |
| evidence 落库 | 同上 |
| Gate S 搜索闭环 | provider 瞬时不可用 + prompt 过大（见 search-spike/report.md） |

## 结论

**API 链路已经真实打通**（readiness / 路由挂载 / TS→Python 转发 / 并发幂等 / plan 全通）。
**完整执行受本地模型性能限制**，需要先做 prompt 瘦身（38 工具 → <15）才能实用。

这次联调发现了 **3 个真实缺陷，其中 1 个是 Critical**（plan 永远失败），
且全部是单测覆盖不到的。

---

# 🎉 完整链路跑通（2026-10-24 14:20）

**首次真实完成 `verified` 状态。**

## 最终结果

```
exec: ('exec_4c72542d122440a4', 'verified', None)
task: ('task_verify_v2', 'verified', 1)
evidence: 14 条 tool_result
trace: trace_exec_4c72542d122440a4_exec | status: verified | verifications: 10
```

## 任务

```
goal: 列出 ten_document_inbox 目录下的文件名，用中文回答，不要写任何文件
verdict: select
```

## 修复链（按发现顺序）

| # | 缺陷 | 现象 | 修复 |
|---|---|---|---|
| D1 | `confirmation_token` 混入 TaskEnvelope | `/v1/plan` 500 `TypeError: unexpected keyword argument` | token 改为独立参数传递 |
| D2 | 错误详情被丢弃 | trace 只有 `request failed` | 拼接 `ServiceUnavailableError.detail` |
| D3 | 超时配置卡边界 | Python 跑完但 TS 已断开 | 35→60 分钟 fetch、30→55 分钟 turn |
| **D4** | **Node fetch 的 300 秒 headersTimeout** | `fetch failed; cause: Headers Timeout Error` | **改用 `node:http` 重写 `callService`** |

**D4 最关键**：Node 内置 `fetch`（undici）有 300 秒的 `headersTimeout` 硬限制，`AbortSignal.timeout` **无法覆盖**。Python service 要等整个 execute 完成才写响应头，本地模型一轮 25+ 分钟 → 必然超时。只有换成 `node:http` 才能解决。

## 为什么单测发现不了这 4 个

`personal-pipeline.test.ts` 的 stub 服务：
- 立即响应（不模拟长 turn）→ 测不出 D4
- 接受任意 body（不校验 schema）→ 测不出 D1
- 返回 200 而非抛异常 → 测不出 D2/D3 的错误路径

**这 4 个缺陷全部是真实端到端联调才暴露的。**

## 性能实测

| 指标 | 值 |
|---|---|
| 工具数 | 11（从 38 精简） |
| prompt tokens | **13,537**（精简后仍很大） |
| prefill 速度 | 13-14 tok/s |
| 单轮总耗时 | **约 30 分钟** |
| 验证回执 | 10 条，全部 verified |

**注意**：精简工具到 11 个后 prompt 仍是 13.5k，说明 **harness 的系统提示本身占大头**，不是工具 schema。
要真正提速必须换更快的模型或减小系统提示，仅靠 `tools_disabled` 不够。

## 仍然未验证

| 项 | 说明 |
|---|---|
| HITL 审批触发 | 本次任务只读，未触发 `hitl_required`（`hitl: 0`） |
| Gate S 搜索 | provider 不稳定 + 搜索回执提取已修但未复跑 |
| UI 接真（Task 8） | 依赖 Gate S，未开工 |
| MUA-01..07 | 未执行 |

---

## 证据存档

成功运行的完整数据目录：`manual-qa/2026-10-23/successful-run/`

```
task: ('task_verify_v2', 'verified')
exec: ('exec_4c72542d122440a4', 'verified')
evidence count: 14
```

可直接查询：

```bash
python -c "
import sqlite3
db = sqlite3.connect('manual-qa/2026-10-23/successful-run/personal/personal.sqlite')
for r in db.execute('SELECT id,status FROM tasks'): print(r)
for r in db.execute('SELECT execution_id,status FROM executions'): print(r)
print('evidence:', db.execute('SELECT COUNT(*) FROM evidence').fetchone()[0])
"
```

## 复现步骤

```bash
# 1. llama-server
cd /d/qwen && ./llama.cpp/cuda/llama-server.exe -m "./model-repo/Qwen3.6-35B-A3B-...-Compact.gguf" -c 131072 --host 127.0.0.1 --port 18080 --jinja

# 2. Octop
cd /d/claude-ecosystem/Octop-main/Octop-main
OCTOP_HOME="D:\claude-ecosystem\octop-home" ./.venv/Scripts/python.exe -m octop run

# 3. personal service
cd /d/claude-ecosystem/org-engine/engine && PYTHONPATH=. python -m personal.service

# 4. backend（必须在 backend-server 目录，否则 tsx 找不到 src/server.ts）
cd /d/claude-ecosystem/org-engine/editor/backend-server
ORG_ENGINE_HOME="D:/.../home" OCTOP_BASE_URL="http://127.0.0.1:8088" \
OCTOP_WORKSPACE_ROOT="D:/claude-ecosystem/octop-playground" \
OCTOP_PASSWORD="octop-local-2026" PERSONAL_SERVICE_URL="http://127.0.0.1:5174" \
PORT=15175 npx tsx src/server.ts

# 5. 建任务 + 跑（约 30 分钟）
curl -X POST http://127.0.0.1:15175/api/v1/personal/tasks -H "Content-Type: application/json" --data-binary @task.json
curl -X POST http://127.0.0.1:15175/api/v1/personal/tasks/<id>/run -H "Content-Type: application/json" -d '{}'
```
