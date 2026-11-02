# Octop 为主体 · 结合方案

日期：2026-10-17。上游计划：`2026-10-04-local-personal-decision-assistant-plan.md`、`2026-10-04-laya-octop-project-review.md`。
本文件回答两个问题：为什么此前交付物"没有任何能用的地方"；现在怎样按原计划把 Octop 立为主体、把 Org Engine 变成它之上的个人决策层。

## 0. 复盘：断点在哪

逐条核实（不是猜测）：

| # | 断点 | 证据 |
| --- | --- | --- |
| 1 | Octop 从未真正运行过 | P0.6 spike 只读了源码 zip（`octop-compatibility-spike.md` §0"不启动 Octop 服务"） |
| 2 | Octop 适配层只有 fake | `engine/personal/adapters/octop.py` 的 `OctopTransport` 是 Protocol 接口，唯一实现是测试里的内存 fake；`octop-adapter.md` 自己写明"隔离实例测试待 Octop 实装后补" |
| 3 | octop.routes.ts 是死代码 | `editor/backend-server/src/server.ts` 从未 import/注册 `registerOctopRoutes` |
| 4 | 任务 API 不触发任何管线 | `personal/routes.ts` POST /tasks 只做 schema 校验 + 存 SQLite；intent→plan→confirm→execute→verify 一环都不存在 |
| 5 | UI 渲染样例数据 | `PersonalApp.tsx` 的 `SAMPLE_OUTCOME` |
| 6 | 双控制台 | 独立 Electron 壳 = 第二个控制台，正是计划 §2.1 警告、复盘 kill criteria 点名的形态 |

结论：**组件齐、管线无**。所有引擎侧能力（DecisionPolicy/RuleEngine/permission_gate/verifiers/sandbox/learning，282 个 Python 测试）和存储侧（personal.sqlite、API、审计）都存在且测试通过，但从未被一条真实运行链路串起来。修复方向不是继续打磨 Electron 壳，而是回到原计划：**Octop 执行底座 + Org Engine 个人决策层**。

## 1. Octop 事实清单（2026-10-17 源码详读，v1.0.2b5）

运行时（全部已验证）：

- `octop run` 自举一切：config.json 自动写入、octop.db 自动建+迁移、JWT secret 存 DB；绑 `127.0.0.1:8088`；`OCTOP_HOME` 可重定位；Windows 无 Docker/Postgres 依赖；源码运行用 `uv sync`。
- Windows 限制：无系统服务、无终端 AI+、无 bubblewrap（不影响本方案）。
- 桌面客户端是 **Wails v3 + 内置便携 Python**（不是 Electron）；spawn 命令 = `runtime/python.exe launch.py run --host 127.0.0.1 --port <port>`。合并产品的最终打包形态应以此为参照。

程序化驱动面：

- **发消息只有 WS**：`WS /api/agents/{agent_id}/chat/ws?token=<jwt>`；帧 `{"type":"user_turn","text":...,"thread_id":...,"hitl_policy":{"mode":"ask|allow_all|allow_tools","tools":[...]}}`。HTTP 无 POST 发消息端点。
- 回合 chunk 类型：`token / tool_call_chunk / tool_result / hitl_required / done / error / usage / state_update`（每帧带 `thread_id`）。
- **HITL 审批就是现成的"人工确认"机制**：harness 暂停并发出 `hitl_required {action_requests:[{name,args,description}], review_configs:[{action_name,allowed_decisions}]}`；恢复用 `POST /api/agents/{id}/chat/hitl/resume {thread_id, decisions:[{type:"approve"|"reject"|"edit"|"respond"}]}`（SSE）。pending 在内存（30 分钟 TTL），持久暂停在 harness LangGraph checkpoint，`GET .../chat/history → hitl_pending` 可重建。
- 审批配置三层：全局 `PUT /api/admin/security`（默认 `hitl.enabled=False`、`tool_guard=warn`）；每 agent `config_json["security"]` 合并覆盖；每回合 `hitl_policy` **只能放行、不能升级**，`ask_user_question` 永不可绕过。
- 回执载体：trajectory 事件 `kind="tool"`，call payload `{call_id,name,args}`、result payload `{call_id,name,result}`（`trajectory/projector.py`）——**与 org-engine 协议映射（`engine/personal/protocols/octop.py`、`protocol.ts`）完全一致**。注意：列表端点把 args/result 截到 64k，取全量用 `GET .../trajectory/events/{event_id}`。
- 鉴权：`POST /api/auth/login` → JWT（HTTP 用 Bearer、WS 用 `?token=`）；无服务账号机制，后端对后端用一个普通用户。
- Agent CRUD：`POST /api/agents {"name":...}` 即可建；`POST .../start` 启动；`config_json` 放 backend/security/workspace_dir。
- 工具：`ls/read_file/write_file/edit_file/glob/grep/execute`；`write_file/edit_file/execute` 可禁用（`config_json["tools_disabled"]`）；`ls/read_file/glob/grep` 不可禁用。
- 工作区：`config_json["backend"]={"type":"filesystem","root_dir":"<任意本机绝对目录>","virtual_mode":true}` 可指向用户授权目录（默认无 per-user 策略时只挡 POSIX 黑名单）；Windows 默认 `local_shell` virtual_mode。
- 插件：`plugin.yaml + main.py setup(ctx)` 注册 LLM 工具/技能/UI 静态资源，**不能加 HTTP 路由**——决策层第一版走独立进程 + HTTP，不走插件。
- 无内置本地对话模型运行时：chat 必须接 Ollama 或 OpenAI 兼容 API（provider 预设来自 octop-harness）。

## 2. 目标架构（Octop = 主体）

```text
[Octop :8088 —— 主体应用]
  ├─ Web 控制台（模型/Agent/连接器管理；高级用户入口）
  ├─ agent "personal"：workspace=用户授权目录；execute 禁用；
  │   write_file/edit_file/外部类工具 → HITL 暂停
  └─ 工具执行 + trajectory 回执
[Org Engine 个人决策层 —— 与 Octop 进程隔离，loopback 互访]
  ├─ TS backend（保留）：personal.sqlite、个人 API、审计；管线的持久化与状态机
  ├─ Python engine service（新增薄 HTTP 壳）：plan / verify 复用 engine/personal
  │   现有 DecisionPolicy、RuleEngine、permission_gate、verifiers、sandbox
  └─ OctopTransport（新增，Python 侧）：WS user_turn 驱动 + hitl/resume 门禁
      + trajectory 回执采集
[小白 UI]
  事项/规则/依据/确认 —— 默认路径不出现 Octop/Agent 术语（计划 P4.3）
```

**确认门禁的真实落点（本次结合的核心机制）**：

1. Org Engine 按合同发 turn，读类工具 `allow_tools:[ls,read_file,glob,grep]` 放行。
2. agent 调 `write_file` → Octop `hitl_required` → Org Engine 取 `name+args`，
   算参数 hash，过 `permission_gate`：
   - 低风险且参数与已确认一致 → 自动 approve（token 记入 trace）；
   - 参数变更/高风险无 token → 挂起，进个人 UI 待确认；用户确认后才 approve；
   - 命中禁止规则 → reject（附用户可读原因）。
3. 每次执行产出 tool 事件 → `protocol.ts/octop.py` 映射为 Evidence；
   **verifier 直接读本地文件核对 hash**（工作区在本机，验证比"回执状态=success"更强）。
4. Octop 侧安全（tool_guard、HITL 配置）+ Org Engine 侧规则双重把关——两边权限模型
   不互相替代（spike §4 结论不变）。

数据主权单向不变：Octop 是会话/回执唯一来源；Org Engine 是规则/trace/证据/学习唯一来源；互不写对方库。

## 3. 实施阶段

### Phase A — Octop 在本机立起来（先手工验证，不写代码）
1. `uv sync` 装依赖（Python 3.12 由 uv 管理，不污染 Anaconda）。
2. `octop init`（管理员账号；`OCTOP_HOME` 默认 `~/.octop`）。
3. 配置 provider（模型来源见开放问题）；`octop run`。
4. 手工最小闭环：登录 → 建agent → 开 thread → WS 发 turn → 收 chunk →
   造一次 `write_file` 触发 `hitl_required` → hitl/resume approve → 查 trajectory 回执。
5. 产出：`editor/docs/integration/octop-live-spike.md`（真实会话证据）。

### Phase B — 决策层与 Octop 接通（真实管线第一版）
1. `engine/personal/service.py`：薄 HTTP 服务包 `plan/verify`（复用现有模块，不重写逻辑）。
2. `engine/personal/adapters/octop_http.py`：真实 Transport（登录、建/查 agent、
   WS user_turn、hitl/resume、trajectory 读取），替换 fake。
3. `editor/backend-server` 注册 octop/pipeline 路由：POST /tasks/:id/run 起管线；
   状态机 draft→planned→awaiting_confirmation→running→verified/failed/blocked；
   事件/回执落 evidence 与 trace。
4. 测试：fake transport 单测保持；新增"隔离 Octop 实例"集成测试（Phase A 的实机）。

### Phase C — MUA-02 真实化（第一个真场景）
1. `ten_document_inbox` 夹具放进授权目录；agent workspace 指向它。
2. 用户输入"整理这些材料…" → 真实 turn → agent 读文件 → 汇总表 write_file
   → HITL 门禁 → approve → 落盘 → verifier 核 hash → UI 显示真证据。
3. 歧义/失败分支按计划夹具矩阵验证。

### Phase D — UI 接真 + 交付形态修正
1. PersonalApp 撤掉 SAMPLE_OUTCOME，全部走真管线。
2. **Electron 独立 NSIS 安装包停止作为产品交付**（release/ 留档）；
   合并产品的分发以 Octop 桌面端（Wails portable）为参照，后续评估。
3. onboarding 的"模型/工作区"选择落到真实 provider/workspace 配置。

### Phase E — 并入 Octop 控制台（计划 §2.1 第 2 步，后置）
决策层页面并入 Octop dashboard，消灭双控制台；此阶段再评估插件/自定义页机制。

## 4. 停止事项（对应 kill criteria）
- 不再给 Electron 独立壳加个人助理功能。
- 不复制 Octop 的 Connector/IM/Memory/浏览器能力（执行全走 Octop）。

## 5. 开放问题
- 模型来源：本机无 Ollama。选项：A) 用现有 OpenAI 兼容 API 代理先跑通闭环（快，
  但任务材料会发给该服务）；B) 本机装 Ollama（D 盘）+ 中文小模型（完全本地，下载量大、推理慢）。先 A 后 B 可行：provider 是配置项，随时可切。
- Octop agent 的 `workspace_dir` 能否在 create payload 直接指定（`AgentCreateBody` 未列，需实测）——若不行则用 `backend.root_dir` 派生路径或 PATCH config。
- HITL pending 30 分钟 TTL 与重启丢失：决策层需把 hitl_pending 轮询做成幂等恢复（`GET history → hitl_pending`）。
