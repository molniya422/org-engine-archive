# Octop Live Spike — A3 实机验证记录

日期：2026-10-17。环境：本机 Windows 11，Octop v1.0.2b5 源码运行（uv，64 位 CPython 3.12.13），
隔离实例 `OCTOP_HOME=D:\claude-ecosystem\octop-home`；模型：本机 llama-server
`D:\qwen\llama.cpp\cuda\llama-server.exe`（Qwen3.6-35B-A3B Compact GGUF，127.0.0.1:18080，`--jinja` OpenAI 兼容）。
测试 agent：`DSE30J`（name=personal，workspace 派生到
`D:/claude-ecosystem/octop-playground/.octop/workspaces/DSE30J`，`tools_disabled:["execute"]`）。

## 1. 已在实机验证的事实

| # | 事实 | 证据 |
| --- | --- | --- |
| 1 | `octop run` + `octop init` 全流程可跑；`~/.octop` 已存在旧安装 venv，用 `OCTOP_HOME` 隔离规避 | health `{"ok":true,"db":true,"users_loaded":1}` |
| 2 | JWT 登录（slider captcha 默认无校验，程序化可省 `captcha_token`） | `POST /api/auth/login` → access_token |
| 3 | `POST /api/agents` 只需 name；`config.backend={type:"filesystem",root_dir,virtual_mode}` 生效，workspace 派生为 `{root_dir}/.octop/workspaces/<agent_id>` | 201，`config.workspace_dir="/.octop/workspaces/DSE30J"`；PATCH workspace_dir 不生效（仅 create 派生） |
| 4 | WS 回合链路：`?token=` 连接 → `subscribe` → `user_turn` → chunk 流 | turn 被接受，state_snapshot/state_update 流动 |
| 5 | **回执契约与 org-engine 协议映射一致**：trajectory `kind="tool"`，payload 键 = `[call_id,name,args(,result)]`（service 按 call_id 合并 call+result） | 实测 seq=7 ls、seq=9/10 read_file 均 `args+result` |
| 6 | agent 真实读盘：ls + read_file×2 命中 `inbox/报销单.md`、`inbox/会议纪要.md` | tool_result 非空，is_error=false |
| 7 | 默认**无门禁**：全局 `hitl.enabled=False`、`tool_guard=warn` → agent 可自由 write_file（危险面，待 A3 第二阶段配安全策略验证 HITL） | hitl_pending=null |

## 2. 实测发现的问题（Phase B 必须处理）

1. **提示词 12,688 tokens、预填充 ~19.8 tok/s ≈ 10.7 分钟**（6GB VRAM + CPU 混合）。
   来源：harness 工具 schema（约 25 个工具）+ 系统提示。个人 agent 必须精简：
   目标 = 关掉不需要的工具（browser/知识库/媒体/cron 等），换最小系统提示。
   同 thread 前缀 KV 缓存可复用，后续回合预填充显著变快（待实测）。
2. 模型是 reasoning 型（`reasoning_content` 先于 `content`）：agent `max_tokens` 已设 4096，
   产品配置要给足预算，且 UI 展示要剥离思考段。
3. MINGW bash 内联 JSON 中的反斜杠/中文会被转义损坏 → 所有带中文/反斜杠的请求体
   必须走文件或程序内 JSON.stringify（Node/Python 直连），不能走 bash 内联 curl。
4. turn 串行：同 thread 回合排队（thread execution lock），外部驱动必须等 `done` 再发下一条。

## 3. HITL 门禁实测（2026-10-17 补全）

1. **无门禁危险面（已实证）**：默认 `hitl.enabled=False` 时，agent 的 write_file
   直接执行并返回 "Updated file /summary.md"（turn 2，seq=19），无任何暂停。
2. **门禁生效路径（已实证）**：`PUT /api/admin/security`
   `{"hitl":{"enabled":true,"tools":["write_file","edit_file"],"allowed_decisions":["approve","reject"]}}`
   → `POST /api/agents/{id}/reload` → 新回合中 agent 调 write_file 时 WS 流发出
   `hitl_required`，request 完整携带：
   `{"action_requests":[{"name":"write_file","args":{"file_path":"/gated-note.md","content":"…"},"description":"…"}],
     "review_configs":[{"action_name":"write_file","allowed_decisions":["approve","reject"]}]}`
   → `POST hitl/resume {"thread_id","decisions":[{"type":"approve"}]}` → HTTP 200
   → `gated-note.md` 落盘，内容与 args 一字不差。
3. **per-agent `config.security` 合并未生效**（config 正确存储、reload 后仍不暂停）；
   全局策略路径有效。待查 merge 链（octop-harness SecurityPolicy.merge 语义 vs
   manager 传参）——产品化先用全局策略（与 dashboard 设置页同一接口）。
4. **暂停时序**：WS 流在 hitl_required 后紧跟 `done`；续跑 chunk 在 resume 的
   SSE 响应里（原 WS 订阅不会再收到）。octop_ws.py 已按"WS 循环 + resume SSE
   续流"实现并配单测。
5. **args 流式分片**：tool_call_chunk 的 args 片段分属 call_id 键与数字 index 键
   两路（OpenAI 流式约定）；trajectory 持久层只留首片段（args="{"），完整参数
   只有 live 流能拿到——回执一律以 live 流累积 + 审批权威参数覆盖。

## 4. Phase C（进行中）
- ten_document_inbox 夹具已建到 agent 工作区根（10 份 doc_XX.md）。
- 经 `engine/personal/service.py`（loopback:5174）走 /v1/plan → /v1/execute 全链路，
  报告落 phase_c_report.json。结果待补。

## 4. 复现命令
```bash
# llama-server（模型加载 ~2 分钟）
cd /d/qwen && ./llama.cpp/cuda/llama-server.exe -m "./model-repo/Qwen3.6-35B-A3B-Claude-4.7-Opus-Reasoning-Distilled-APEX-MTP-I-Compact.gguf" -c 131072 --host 127.0.0.1 --port 18080 --jinja

# Octop（另一终端）
cd /d/claude-ecosystem/Octop-main/Octop-main
export OCTOP_HOME="D:\claude-ecosystem\octop-home"
UV_DEFAULT_INDEX=https://mirrors.aliyun.com/pypi/simple/ uv sync --python 3.12.13-windows-x86_64-none
uv run octop run

# 客户端脚本
node D:/claude-ecosystem/octop-playground/ws-loop-test.mjs
python D:/claude-ecosystem/octop-playground/check_state.py
```
