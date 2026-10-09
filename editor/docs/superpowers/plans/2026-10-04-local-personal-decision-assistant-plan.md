# Local Personal Affairs Assistant

## Goal

把现有 Org Engine 演进成一个本地优先的个人事务助理，而不是再做一个通用聊天机器人或另一个 Octop。

产品面向广泛的日常个人事务。用户可以像和熟悉的助理交代事情一样，用自然语言提出需求、补充条件、修改计划或追问进度；系统需要结合当前对话和用户明确保存的偏好理解指代与上下文，缺少关键信息时用少量问题澄清，再调用合适的能力完成任务。

文件表格整理、天气穿衣提醒、旅行与酒店只是代表性例子，不构成固定功能清单。产品能力按日常生活中的事务逐步扩展，例如日程与提醒、资料与数据整理、出行与预约、家庭杂务、个人沟通和表单处理。新能力通过统一的事务和工具约定接入，每类动作根据风险决定是否需要确认。所谓越用越懂用户，首先体现在偏好、习惯、称呼和授权边界的可查看学习，而不是偷偷修改模型或猜测用户意图。

产品承诺不是“绝对零幻觉”，而是：

> 没有证据不下结论，没有授权不执行，无法验证就明确说未完成。

首个 Alpha 用三个代表性场景验证同一事务内核能否覆盖不同类型的日常事务；这三个场景是验证样本，不是产品边界：

1. 本地文件和表格整理：读取用户授权的文件，整理表格、提取待办、生成草稿和结果文件。
2. 天气驱动的个人提醒：在用户明确开启天气来源后，根据地点、时间和已确认的穿衣偏好生成提醒；天气数据是外部事实，必须标注来源和时间。
3. 旅行事务规划：理解目的地、日期、预算和偏好，查询并比较酒店，先生成可解释的方案；实际预订和付款放到后续阶段，必须逐步确认并验证订单。

三个场景共用“理解事务 -> 补齐信息 -> 生成计划 -> 风险分级 -> 用户确认 -> 执行 -> 验证 -> 学习提案”的同一闭环。它们分别覆盖离线文件操作、基于外部信息的主动提醒和有交易风险的旅行规划，用来验证事务内核的通用性；更多日常事务在 Alpha 之后按使用价值逐步加入。

第一阶段不做：

- 在首个版本中承诺任意事务都能自动完成，或一次性接入所有生活服务。
- 公网多租户 SaaS。
- 自主修改模型权重。
- 无限制的开放网络、默认接入 IM、邮件和付款。
- 未经用户确认的酒店预订、订单提交或付款。
- 读取用户未授权的文件、定位、日历、邮箱或浏览记录。
- 用多 Agent 数量制造“智能”观感。
- 以“零幻觉”作为不可验证的营销承诺。

## Architecture

### 1. Product boundary

用户看到的是“事项、规则、依据、风险、确认、完成证据”，并能用自然语言交代不同类型的日常事务，不需要先选择或理解内部 Agent 类型。

能力不是写死在三个示例里。每个可扩展能力包都声明适用事务、所需信息、可用工具、风险级别、确认要求、证据和完成验证方式；首页仍由统一的自然语言入口接收请求，再根据用户意图选择能力包。未支持的事务必须明确说明，并允许用户选择保留请求，不能假装已处理。

同一个事项可以组合多种能力。例如“按这份出差通知帮我准备行程，选酒店，再提醒我出门”，先提取通知中的日期和地点，再查询酒店并生成方案，最后按用户确认的时间建立提醒。步骤通过 TaskContract 的依赖和已验证结果引用连接，共享事项上下文；每步分别确认和验证，部分成功必须显示为部分完成。普通用户不需要配置这些组合。

用户看不到以下内部术语：

- Agent
- Skill
- Workflow
- Department
- Gateway
- Org

现有 Org Engine 继续作为内部执行和审查内核。前端把它隐藏在“执行步骤”和“检查结果”之下。

系统分为七层：

1. 交互层：自然语言输入、事项卡、规则管理、确认界面。
2. 个人状态层：事实、偏好、禁忌、规则、历史案例和来源。
3. 决策层：DecisionPolicy 接口，JEV 作为可插拔实现。
4. 编排层：单模型、并行模型、审查器和人工确认的动态路由。
5. 工具层：本地文件、表格/文档解析、天气查询、提醒、草稿和受控外部连接。
6. 证据层：来源、动作日志、验证器、回放和个人回归测试集。
7. 学习层：从行为中产生候选规则，经过审批、版本化和回滚后生效。

数据流必须保持单向可解释：

~~~text
用户目标
  -> Intent
  -> TaskContract
  -> Evidence retrieval
  -> Candidate plans
  -> DecisionPolicy
  -> Rule gate
  -> Simulation
  -> User confirmation
  -> Tool execution
  -> Verification
  -> DecisionTrace
  -> LearningProposal
~~~

### 2. Relation to Octop

Octop 官方站点和中文 README 当前已经覆盖：

- 本地优先和私有部署。
- 多用户、多专家和专家共享。
- Connector、OAuth 和 MCP 网关。
- 可插拔工作区、本地目录、Docker、PostgreSQL、COS/S3。
- 可迁移记忆、知识库和插件。
- Loop Engineering、检查点、动态模型路由。
- IM 通道、定时任务、浏览器自动化、远程桌面。
- ACP 与 IDE/终端 Agent 集成。

参考：

- https://tencentcloud.github.io/Octop/
- https://github.com/TencentCloud/Octop

因此本项目不与 Octop 在以下维度竞争：

| 不作为差异化 | 原因 |
| --- | --- |
| 支持多少 IM | Octop 已经覆盖这条路线 |
| 支持多少模型 | 这是基础设施能力，不是护城河 |
| Connector 数量 | 可以复用 MCP，不应成为首版目标 |
| 远程桌面和浏览器 | 属于执行能力，不属于个人决策价值 |
| 多 Agent 并行数量 | 数量不等于结果质量 |
| “本地部署” | Octop 已明确拥有此定位 |

本项目必须在以下维度形成差异：

| 本项目的核心 | 可验证定义 |
| --- | --- |
| 个人代理包 | 用户事实、偏好、禁忌、规则、权限、案例和回归集可查看、导出、版本化、回滚 |
| 结果合同 | 每项任务都有目标、完成标准、证据要求、风险和待确认动作 |
| 证据优先决策 | 事实、推断、建议和执行结果分离，缺来源不能升级为事实 |
| 决策而非聊天 | 系统输出“现在应该做什么、为什么、风险是什么、需要你确认什么” |
| 沙盒预演 | 真实动作前可以模拟并比较方案，模拟结果不能伪装成真实完成 |
| 个人回放 | 新模型、新规则、新流程必须通过该用户的历史案例集才可启用 |
| 多 Agent 透明编排 | 仅在确实需要独立信息源或独立审查时并行，用户能看到每个角色的贡献和依据 |
| 隐私可证明 | 默认离线、网络工具关闭、数据边界和导出内容可见 |

### 2.1 Integration decision

推荐采用“Octop 执行底座 + Org Engine 个人决策层”的组合方式，保持协议兼容，避免把两个完整 Agent 平台的运行时硬合并。

能力归属：

| 能力 | Octop 负责 | Org Engine 负责 |
| --- | --- | --- |
| 模型调用 | 本地模型、模型路由、上下文执行 | 选择何时调用、输出是否可进入下一步 |
| 工具和连接器 | MCP、OAuth、IM、浏览器、远程桌面 | 工具是否允许、参数是否需要确认、动作是否可撤销 |
| 会话和通道 | Web、CLI、IM、ACP | 任务合同和跨会话个人决策状态 |
| 工作区执行 | 本地目录、Docker、浏览器 profile | 任务范围、敏感字段和沙盒策略 |
| 普通记忆 | Octop Memory 和知识库 | 个人事实、规则、证据链、个人回归案例 |
| 多 Agent | 专家运行时和基础并发 | 是否需要并行、如何审查、如何处理冲突 |
| 安全执行 | 工具审批、Shell guard、身份隔离 | 结果合同、确认 token、决策否决、验证完成 |
| 控制台 | 通用 Agent 管理 | 小白使用的事项、依据、风险和确认体验 |

首选集成形态分三步：

1. MVP 使用 Octop 的 MCP、ACP 或本地 HTTP 能力作为外部执行接口，Org Engine 先作为独立决策服务，降低耦合。
2. 稳定协议后，再把 Org Engine 的个人决策服务做成 Octop plugin 或 dashboard 扩展，减少双控制台。
3. 只有性能和部署证明确实需要时，才把部分 Python 组件做成 Octop 进程内模块；不复制 Octop 的模型、Connector、Browser 和 Memory 实现。

数据主权必须单向：

~~~text
Octop session / tool receipt
          -> PersonalDecisionProtocol
Org Engine policy / evidence / confirmation
          -> approved action
Octop executor
          -> verified receipt
Org Engine trace / learning proposal
~~~

数据归属规则：

- Octop 是会话、连接器凭证、工具调用和执行回执的唯一来源。
- Org Engine 是个人规则、决策 trace、证据索引、回归集和学习提案的唯一来源。
- 两边只通过版本化协议传递引用和回执，不互相直接写数据库。
- 任何高风险动作必须同时满足 Octop 的工具护栏和 Org Engine 的个人规则。
- Octop 不可用时，Org Engine 仍可查看规则、历史 trace、回放和离线草稿。

这条路线的收益是直接获得 Octop 已经完成的部署、连接器、浏览器、通道和本地运行能力，同时把现有 Org Engine 的组织编排、审计、反馈和学习机制变成清晰的个人价值。主要风险是版本兼容、两套权限模型和双控制台体验，必须由 PersonalDecisionProtocol、单向数据主权和统一确认状态解决。

### 3. Small-model strategy

小模型不承担所有智能。职责分层如下：

| 组件 | 负责 | 不负责 |
| --- | --- | --- |
| Local LLM | 意图理解、实体提取、候选方案、自然语言表达 | 最终事实确认、权限判定、高风险执行 |
| Personal State | 保存用户事实、偏好、规则、来源、置信度和有效期 | 自行推测用户新偏好 |
| DecisionPolicy | 对候选方案评估价值、风险、信息缺口和下一步 | 修改用户规则 |
| Rule Engine | 硬约束、权限、敏感操作和预算 | 自由生成策略 |
| Tool | 查询真实状态和执行动作 | 解释未知事实 |
| Verifier | 检查动作是否完成并保存证据 | 依赖模型口头宣称完成 |
| Replay/Eval | 检查模型和规则变更是否破坏历史行为 | 直接决定用户偏好 |

为了让小模型“听得懂但不乱做”，每个事务都先转换为受约束的 IntentEnvelope：目标、事务类型、实体、时间、地点、预算、偏好、缺失字段和置信度。对话状态负责保留本轮任务上下文，使“改成周五”“选便宜一点”“刚才那个酒店”能关联到正确事项；关键执行前用简短的事项摘要让用户纠正误解。模型只负责提取和改写；Laya/JEV 负责有限候选的分类、排序和澄清路由；规则、工具查询结果、授权和验证器拥有最终控制权。这样理解自然语言和决定能否执行分开处理，不依赖更大的通用模型兜底。

补偿小模型智力不足的顺序：

1. 让输出受 JSON Schema 和有限状态机约束。
2. 只把经过筛选的个人事实和历史案例放入上下文。
3. 让模型生成多个候选，再由规则和验证器筛选。
4. 把长任务拆成短合同，每步都保存状态。
5. 为检索、规划、表达和审查使用不同的小模型或不同提示模板。
6. 失败时降低任务范围、继续提问或转为人工确认。
7. 等有足够个人数据后，再研究 LoRA、蒸馏和小模型微调。

不允许静默云端兜底。若本地模型不可用，系统必须明确显示“本地模型未准备好”，并提供导入模型、改用规则模式或取消任务三个选择。

### 4. JEV integration

“JEV”具体定义尚未在现有项目中确认，因此架构不把它写死。所有决策模型实现 DecisionPolicy 接口。

接口语义：

~~~text
DecisionPolicy.evaluate(state, candidates, constraints) -> DecisionResult
DecisionPolicy.explain(result) -> DecisionExplanation
DecisionPolicy.version() -> PolicyVersion
~~~

DecisionResult 至少包含：

- selected_action
- rejected_actions
- expected_value
- risk_level
- uncertainty
- missing_information
- evidence_refs
- rule_refs
- requires_confirmation
- policy_version

JEV 可以先作为：

1. 规则和价值函数的本地实现。
2. 独立 Python adapter。
3. 后续可替换的模型策略。

没有确认 JEV 的输入、训练方式、许可证和运行成本以前，不把它作为产品硬依赖。

### 5. Multi-agent policy

默认路由顺序：

1. 单模型完成。
2. 单模型加检索。
3. 单模型加规则检查。
4. 两个独立候选加审查器。
5. 只有在任务需要不同工具或互相独立的证据源时才启动多 Agent。
6. 任何高风险动作都进入人工确认。

启动多 Agent 的必要条件：

- 至少两个子任务有独立输入。
- 子任务结果可以分别验证。
- 并行成本小于失败和返工成本。
- 合并结果有确定的冲突处理规则。

不允许因为“多 Agent”这个标签而把简单任务拆成组织会议。

### 6. Privacy and security

默认值：

- 模型运行模式为 local-only。
- 网络工具为 disabled。
- 外部连接逐个授权。
- 文件访问范围为用户选择的工作区。
- 高风险动作需要一次性确认。
- 敏感字段在发送给其他 Agent 前脱敏。
- 个人记忆支持查看、修改、删除、导出和过期。
- 所有动作、授权和撤销都写入审计日志。

高风险动作：

- 发送消息或邮件。
- 提交表单。
- 删除或覆盖文件。
- 付款、下单或转账。
- 修改系统设置。
- 对外发布内容。
- 共享包含个人信息的文件。

## Tech Stack

### Existing code to reuse

| 能力 | 现有路径 | 规划中的用途 |
| --- | --- | --- |
| 组织编排 | org-engine/engine/harness/organization_orchestrator.py | 内部任务执行和审查 |
| 多 Agent 编排 | org-engine/engine/harness/multiagent_orchestrator.py | 仅在路由策略允许时使用 |
| 适配器 | org-engine/engine/harness/orchestrator_adapter.py | 统一 Python 执行边界 |
| 学习结构 | org-engine/engine/learning/schema.py | 扩展为个人学习提案，不复制学习闭环 |
| 学习采集 | org-engine/engine/learning/collector.py | 采集接受、修改、拒绝、撤销信号 |
| 工作区隔离 | org-engine/engine/harness/worktree_manager.py | 沙盒和回放工作区 |
| 记忆检索 | tools/claude-mem-lite | 复用全文和历史观察能力 |
| 前端编辑器 | org-engine/editor/frontend | 事项、证据和确认界面 |
| 后端路由 | org-engine/editor/backend-server | 本地 API、SQLite、模型和工具边界 |
| MCP | org-engine/editor/backend-server/src/mcp/mcp-stdio.ts | 后续作为受控外部入口 |
| 反馈循环 | lean-hooks | 复用行为信号和质量指标，不把 hook 日志直接当作事实 |

### Source of truth

首版由 editor backend 负责个人助理领域数据的持久化。Python engine 只接收版本化 TaskEnvelope 并返回版本化结果，不直接修改用户个人状态。Octop 的会话和工具回执通过 PersonalDecisionProtocol 进入 editor backend；不得把 Octop 数据库和 Org Engine personal.sqlite 合并成一个没有边界的共享数据库。

建议数据目录：

~~~text
<workspace>/.org-engine/personal/
  personal.sqlite
  exports/
  evidence/
  replays/
  eval-cases/
  models/
  audit/
~~~

使用 SQLite WAL，所有写操作通过事务完成。不得把个人状态散落在前端 localStorage、临时 JSON 和 Python 全局变量中。

### Domain contracts

以下类型先用 JSON Schema 固化，再分别生成或手写 TypeScript/Python 类型。字段名必须一致。

UserFact:

~~~json
{
  "id": "fact_01",
  "kind": "identity|schedule|contact|health|finance|work|other",
  "value": {},
  "source_refs": ["evidence_01"],
  "confidence": 0.0,
  "valid_from": "2026-10-04T00:00:00Z",
  "valid_until": null,
  "sensitivity": "normal|sensitive|high",
  "status": "active|expired|revoked",
  "created_at": "2026-10-04T00:00:00Z",
  "updated_at": "2026-10-04T00:00:00Z"
}
~~~

UserRule:

~~~json
{
  "id": "rule_01",
  "when": {"event": "external_send", "scope": "all"},
  "then": {"action": "require_confirmation"},
  "priority": 100,
  "source": "user_explicit|user_approved_learning",
  "status": "active|paused|revoked",
  "version": 1
}
~~~

TaskContract:

~~~json
{
  "id": "task_01",
  "goal": "整理本周收到的材料并列出待办",
  "success_criteria": [
    "列出每份材料的标题和来源",
    "提取带截止时间的待办",
    "无法确定的内容标记为待确认"
  ],
  "allowed_scopes": ["workspace/inbox"],
  "forbidden_actions": ["external_send", "delete", "payment"],
  "required_evidence": ["file_ref", "extraction_ref"],
  "risk_level": "low|medium|high",
  "confirmation_points": [],
  "status": "draft|planned|simulated|awaiting_confirmation|running|verified|blocked|cancelled",
  "version": 1
}
~~~

Evidence:

~~~json
{
  "id": "evidence_01",
  "kind": "file|tool_result|user_statement|execution_receipt|verification",
  "locator": "workspace/inbox/a.pdf#page=2",
  "content_hash": "sha256",
  "captured_at": "2026-10-04T00:00:00Z",
  "sensitivity": "normal|sensitive|high",
  "supports": ["fact_01", "decision_01"]
}
~~~

ActionProposal:

~~~json
{
  "id": "action_01",
  "task_id": "task_01",
  "kind": "read|draft|remind|external_send|delete|submit|payment",
  "parameters": {},
  "risk_level": "low|medium|high",
  "expected_effect": "",
  "rollback": "",
  "evidence_refs": [],
  "requires_confirmation": true,
  "status": "proposed|approved|executed|verified|rejected|rolled_back"
}
~~~

DecisionTrace:

~~~json
{
  "id": "decision_01",
  "task_id": "task_01",
  "input_refs": ["task_01", "fact_01"],
  "candidate_actions": ["action_01"],
  "selected_action": "action_01",
  "rejected_reasons": [],
  "policy_version": "jev-0.1",
  "rule_refs": ["rule_01"],
  "evidence_refs": ["evidence_01"],
  "uncertainty": 0.2,
  "requires_confirmation": true,
  "created_at": "2026-10-04T00:00:00Z"
}
~~~

PersonalEvalCase:

~~~json
{
  "id": "eval_01",
  "input": {},
  "expected_behavior": {
    "must_ask": [],
    "must_not_do": ["external_send"],
    "must_cite": ["evidence_01"],
    "acceptable_actions": ["draft"]
  },
  "sensitivity": "normal|sensitive|high",
  "enabled": true
}
~~~

LearningProposal:

~~~json
{
  "id": "learning_01",
  "signal": "accepted|edited|rejected|revoked|repeated_correction",
  "candidate_change": {},
  "supporting_trace_refs": ["decision_01"],
  "impact_summary": "",
  "requires_user_approval": true,
  "status": "proposed|approved|applied|rejected|reverted",
  "version": 1
}
~~~

## Implementation phases

每个任务都以 2 至 5 分钟的可执行步骤拆分。执行模型必须完成一个任务后再领取下一个任务，并返回变更文件、测试命令、结果和未解决风险。

### Phase 0 - Baseline and release gate

目标：先恢复现有项目的可用基线，避免在运行、导出和安装断裂时叠加个人助理能力。

#### P0.1 Record baseline

1. 在 org-engine/editor 执行 npm test。
2. 执行 npm run build:backend、npm run build:frontend、npm run build:electron。
3. 在 org-engine/engine 执行 Python 测试。
4. 保存所有命令输出到 manual-qa/2026-10-04/baseline/。
5. 把失败按导出、运行、Bridge、Electron、类型构建、环境依赖分类。

Modify:

- org-engine/manual-qa/2026-10-04/baseline/
- org-engine/manual-qa/2026-10-04/baseline-summary.md

Test:

~~~powershell
cd D:/claude-ecosystem/org-engine/editor
npm test
npm run build:backend
npm run build:frontend
npm run build:electron
cd ../../
D:/jiqixuexi/anaconda/python.exe -m pytest org-engine/engine/tests -q
~~~

验收：后续每个阶段都能与该基线区分新增失败，不得把既有失败伪装为新功能通过。

#### P0.2 Fix export truthfulness

1. 复现 YAML 和 JSON 导出。
2. 找到前端点击到浏览器下载的完整链路。
3. 明确后端返回 Content-Disposition、文件名和 UTF-8 编码。
4. 为成功、空数据、后端失败各加一个测试。
5. 用人工浏览器确认真实下载文件存在并能解析。

Modify:

- editor/backend-server/src/org-config/
- editor/frontend/src/
- editor/backend-server tests
- editor/frontend tests

验收：导出按钮产生真实文件；失败时不显示成功提示。

#### P0.3 Fix runtime blocked state

1. 使用现有人工验收任务重现 Starting -> blocked。
2. 分别记录 adapter、harness、gateway 和 run-manager 的状态。
3. 将超时、不可用和用户阻塞分为三个明确状态。
4. 前端显示原因、恢复动作和日志位置。
5. 增加一个真实运行成功或可解释失败的端到端测试。

Modify:

- editor/backend-server/src/run-manager/manager.ts
- editor/backend-server/src/orchestrator-adapter/
- editor/frontend/src/views/
- manual-qa/2026-10-04/

验收：运行不会无限 Starting；不可用时显示明确 blocked reason。

#### P0.4 Fix Bridge installation source

1. 在隔离配置目录运行安装器。
2. 记录脚本计算的 source root、destination root 和复制清单。
3. 修正从错误目录复制 harness 的路径计算。
4. 增加空目录、已有配置和重复安装测试。
5. 确认真实用户配置不被修改。

Modify:

- bridge/
- bridge/tests/ 或等价测试目录
- manual-qa/2026-10-04/bridge/

验收：安装结果非空、可启动、重复安装幂等。

#### P0.5 Establish the mainline repository

1. 将 org-engine/editor 作为唯一编辑器主线。
2. 对比 org-engine-editor 的功能差异和未合并变更。
3. 把仍需保留的能力迁移到主线。
4. 在 org-engine-editor README 写明兼容/归档状态。
5. 后续新功能禁止提交到两个编辑器仓库。

Modify:

- org-engine-editor/README.md
- org-engine/editor/docs/architecture/
- org-engine/editor/docs/superpowers/plans/

验收：执行模型可以根据文档判断唯一开发入口。

#### P0.6 Run Octop compatibility spike

1. 在隔离目录启动 Octop，使用本地模型或 fake provider。
2. 启动 Org Engine backend，使用独立 personal.sqlite。
3. 通过一个最小 MCP、ACP 或本地 HTTP 调用读取 Octop 的会话和工具回执。
4. 把回执转换成 PersonalDecisionProtocol fixture。
5. 用同一个 fixture 在 Org Engine 中完成规则检查、模拟和 trace 保存。
6. 记录协议缺口、版本字段和权限差异。

Create:

- editor/docs/integration/octop-compatibility-spike.md
- editor/docs/integration/fixtures/octop-tool-receipt.json
- editor/backend-server/src/personal/protocol.ts
- engine/personal/protocols/octop.py

Test:

~~~powershell
cd D:/claude-ecosystem/org-engine/editor/backend-server
npm test -- personal protocol
cd ../../engine
D:/jiqixuexi/anaconda/python.exe -m pytest tests -q -k protocol
~~~

验收：不修改 Octop 源码即可完成一次“接收回执 -> 规则判断 -> 生成模拟动作 -> 保存 trace”的闭环。

### Phase 1 - Personal domain kernel

目标：先建立可验证的数据边界，不先做花哨 UI。

#### P1.1 Add canonical schemas

1. 在 schema 目录建立 UserFact、UserRule、IntentEnvelope、TaskContract、Evidence、ActionProposal、DecisionTrace、PersonalEvalCase、LearningProposal 的 JSON Schema。
2. 为每个 schema 增加 id、version、timestamps、status 和 source refs 的约束。
3. 为高风险 action kind 加枚举。
4. 编写一个 valid fixture 和至少三个 invalid fixtures。
5. 执行 JSON Schema 验证测试。

Create:

- editor/schema/personal/user-fact.schema.json
- editor/schema/personal/user-rule.schema.json
- editor/schema/personal/intent-envelope.schema.json
- editor/schema/personal/task-contract.schema.json
- editor/schema/personal/evidence.schema.json
- editor/schema/personal/action-proposal.schema.json
- editor/schema/personal/decision-trace.schema.json
- editor/schema/personal/personal-eval-case.schema.json
- editor/schema/personal/learning-proposal.schema.json
- editor/schema/personal/fixtures/

Test:

~~~powershell
cd D:/claude-ecosystem/org-engine/editor/backend-server
npm test -- personal
~~~

验收：TS 和 Python 后续实现都以这些字段为准，不能各自发明字段名。

#### P1.2 Add backend SQLite store

1. 创建 personalStore 模块。
2. 建立 facts、rules、tasks、conversation_states、evidence、actions、traces、eval_cases、learning_proposals、audit_events 表。
3. 所有表增加 schema_version 和 created_at。
4. 使用事务保存 TaskContract 和相关 evidence。
5. 增加数据库初始化和迁移测试。

Create:

- editor/backend-server/src/personal/store.ts
- editor/backend-server/src/personal/migrations/001_personal.sql
- editor/backend-server/src/personal/store.test.ts

Modify:

- editor/backend-server/src/server.ts
- editor/backend-server/src/config.ts

验收：重启 backend 后个人状态、任务和审计日志仍存在。

#### P1.3 Add source and evidence service

1. 定义 EvidenceRepository。
2. 文件证据只保存工作区相对路径和 hash，不保存未经授权的绝对路径。
3. 工具结果保存原始摘要、hash、捕获时间和敏感级别。
4. 用户陈述必须标记为 user_statement，不得自动升级为 external_fact。
5. 增加 evidence chain 查询。

Create:

- editor/backend-server/src/personal/evidence.ts
- editor/backend-server/src/personal/evidence.test.ts
- engine/personal/evidence.py

验收：任一事实或决策都可以追溯到至少一个来源，或明确标记为用户输入。

#### P1.4 Add personal API

1. 增加 GET/POST facts。
2. 增加 GET/POST/PATCH rules。
3. 增加 POST tasks 和 GET task detail。
4. 增加 GET evidence 和 GET decision trace。
5. 为所有写接口增加 schema 校验和审计事件。

Create:

- editor/backend-server/src/personal/routes.ts
- editor/backend-server/src/personal/routes.test.ts
- editor/frontend/src/api/personal.ts
- editor/frontend/src/types/personal.ts

Modify:

- editor/backend-server/src/server.ts

验收：用 HTTP 测试创建事实、规则和任务，错误输入返回 4xx，不写入半条数据。

### Phase 2 - Local model runtime

目标：让本地小模型成为可替换执行器，并且在失效时安全降级。

#### P2.1 Define LocalModelProvider

1. 定义 generateJson、generateText、health、capabilities 和 close。
2. 每次调用传入 model id、temperature、timeout、schema name 和 trace id。
3. 返回 provider、model、latency、token estimates、raw response hash 和 parsed result。
4. 任何 JSON 解析失败都返回 typed ModelOutputError。
5. 禁止 provider 自行调用网络。

Create:

- engine/personal/model_provider.py
- engine/personal/model_types.py
- engine/personal/model_provider_test.py

验收：用 fake provider 测试成功、超时、JSON 无效、模型不存在四种结果。

#### P2.2 Add Ollama and llama.cpp adapters

1. 先实现 Ollama adapter。
2. 再实现 llama.cpp HTTP adapter。
3. 两个 adapter 使用相同接口。
4. health 检查包括服务可达、模型已加载、上下文长度和 JSON 能力。
5. 在配置中声明 local_only=true。

Create:

- engine/personal/providers/ollama.py
- engine/personal/providers/llama_cpp.py
- engine/personal/providers/provider_tests.py
- editor/backend-server/src/personal/model.routes.ts

验收：服务未启动时能显示可理解的错误，不自动切换云端。

#### P2.3 Add constrained generation

1. 为 intent、task contract、candidate plan、rule proposal 分别建立 JSON Schema。
2. 把 schema 放入 provider 请求。
3. 对 enum、required、additionalProperties 做严格验证。
4. 对失败输出最多进行一次修复请求。
5. 修复仍失败时进入 needs_clarification，不执行动作。

Create:

- engine/personal/prompts/
- engine/personal/constrained_output.py
- engine/personal/constrained_output_test.py

验收：随机破坏模型输出时，系统不会生成可执行的 ActionProposal。

#### P2.4 Add local-model UI

1. 在诊断页显示 provider、model、离线状态、上下文长度和最后健康检查。
2. 显示模型缺失、模型未加载和 JSON 不支持。
3. 提供导入本地模型配置，不上传模型文件。
4. 明确“无本地模型时只能使用规则和手动模式”。

Modify:

- editor/frontend/src/views/DiagnosticsView.tsx
- editor/frontend/src/api/personal.ts
- editor/frontend/src/i18n/

验收：小白可以判断系统能不能工作，不需要阅读终端日志。

#### P2.5 Add intent understanding and conversation state

1. 按 P1.1 的 IntentEnvelope schema 提取事务类型、目标、实体、时间、地点、预算、偏好、缺失字段和置信度；保留用户原话和解析使用的时区。置信度只用于澄清路由，不代表事实为真。
2. 在 conversation_states 保存 conversation_id、当前 task_id、意图版本和已解析的指代；当前对话条件不会自动成为长期偏好。
3. 对“改成周五”“便宜一点”“刚才那个酒店”生成当前意图的字段更新；有多个可能事项或候选时先询问，不能任意选择。
4. 字段修改后递增意图版本，输出受影响字段。P4 接入合同版本更新与重新规划，P5 接入旧参数 confirmation token 失效；正在执行的步骤先确认真实状态，不能直接改写其结果。
5. 关键执行前显示简短事项摘要。未支持的事务返回明确原因和可办理部分，只有用户选择保留时才创建待办。
6. 用固定当前时间、时区和本地 fake provider 覆盖首次请求、补充条件、指代歧义、切换事项、取消、重启恢复和未支持请求，再用真实本地模型复测同一语料。

Create:

- editor/backend-server/src/personal/conversation.ts
- editor/backend-server/src/personal/conversation.test.ts
- engine/personal/intent.py
- engine/personal/intent_test.py

Modify:

- editor/backend-server/src/personal/store.ts

验收：多轮补充只更新正确事项，有歧义时询问；重启后可恢复正在办理的事项，不把临时条件写成永久偏好。条件变更不沿用旧确认的端到端验收在 P4、P5 完成后执行。

### Phase 3 - DecisionPolicy and JEV adapter

目标：把“模型觉得应该做什么”与“系统允许做什么”分开。

#### P3.1 Define DecisionPolicy protocol

1. 创建 DecisionState、CandidateAction、DecisionConstraints 和 DecisionResult。
2. 增加 evidence_refs、rule_refs、uncertainty 和 policy_version。
3. 让 policy 只返回候选选择，不直接调用工具。
4. 为低、中、高风险写出默认策略。
5. 为每个策略写 deterministic tests。

Create:

- engine/personal/decision_policy.py
- engine/personal/decision_types.py
- engine/personal/decision_policy_test.py

验收：policy 不能绕过 RuleEngine，不能直接产生已执行状态。

#### P3.2 Implement baseline policy

1. 使用规则、价值、风险和信息缺口建立 baseline policy。
2. 信息缺口超过阈值时返回 ask_user。
3. 高风险动作总是 requires_confirmation=true。
4. 没有证据的事实只能降级为 unknown。
5. 保存 DecisionTrace。

Create:

- engine/personal/policies/baseline.py
- engine/personal/policies/baseline_test.py

验收：在没有模型时，简单任务仍能按规则完成；危险任务不会自动执行。

#### P3.3 Integrate JEV as optional policy

1. 以 JEVPolicyAdapter 实现 DecisionPolicy。
2. 通过配置选择 baseline 或 JEV。
3. 将 JEV 原始输出转换为 DecisionResult。
4. JEV 输出缺字段时进入 policy_error，不做猜测补全。
5. 对比两种 policy 在同一 eval set 上的结果。

Create:

- engine/personal/policies/jev_adapter.py
- engine/personal/policies/jev_adapter_test.py
- docs/decision-policy.md

验收：卸载 JEV 不影响 baseline；JEV 版本出现在每条 trace 中。

#### P3.4 Add hard RuleEngine

1. 实现权限、范围、确认、敏感度和预算检查。
2. 规则按 priority 评估。
3. 冲突规则采用更严格动作。
4. 用户明确规则优先于模型偏好。
5. 规则命中写入 rule_refs 和 audit event。

Create:

- engine/personal/rules.py
- engine/personal/rules_test.py
- editor/backend-server/src/personal/rule.routes.ts

验收：模型返回允许执行而规则禁止时，最终状态必须是 blocked。

### Phase 4 - Task transaction and Org Engine bridge

目标：把现有多 Agent 组织能力变成透明、按需的内部执行器。

#### P4.1 Add TaskEnvelope bridge

1. 定义 editor backend 到 Python engine 的 TaskEnvelope。
2. 只传任务合同、脱敏状态、证据引用和执行预算。
3. 传入 contract_version、policy_version、trace_id。
4. Python 返回 PlanEnvelope、ExecutionEvent 和 VerificationEnvelope。
5. 不允许 Python 直接写 SQLite。
6. 包含 P2.5 的 IntentEnvelope、意图版本和当前 task_id；用户修改条件时更新合同版本，使受影响的计划重新进入判断流程，不把历史执行结果改写为新计划的完成证据。

Create:

- editor/backend-server/src/personal/task-envelope.ts
- engine/personal/envelopes.py
- engine/personal/envelopes_test.py
- engine/harness/personal_assistant_adapter.py

验收：同一 envelope 可在 fake adapter 中完整 round-trip。

#### P4.2 Implement execution router

1. 根据任务复杂度、证据数量、风险和工具数量计算路由。
2. simple 路由只启动一个模型。
3. review 路由启动候选和审查。
4. parallel 路由映射到现有 multiagent_orchestrator。
5. 每种路由都保存选择原因。

Create:

- engine/personal/execution_router.py
- engine/personal/execution_router_test.py

Modify:

- engine/harness/multiagent_orchestrator.py
- engine/harness/orchestrator_adapter.py

验收：相同输入在相同版本下路由稳定，可解释且可回放。

#### P4.3 Hide organization terminology

1. 给内部 role、department 和 gateway 建立用户可读的 label。
2. 前端显示“整理、检查、需要你确认”，不显示内部组织名称。
3. 高级诊断页保留原始 trace。
4. 增加中英文 i18n。
5. 检查所有新增文案是否暴露技术术语。

Modify:

- editor/frontend/src/views/
- editor/frontend/src/i18n/
- editor/backend-server/src/personal/labels.ts

验收：新用户只看首页和事项页时不需要理解 Agent 术语。

#### P4.4 Add Octop execution adapter

1. 为 Octop MCP、ACP 或 HTTP 选择一个最小稳定入口，并记录版本。
2. 实现 list sessions、read tool receipt、propose tool action 和 execute approved action 的协议映射。
3. 每次请求附带 contract_version、policy_version、trace_id 和 confirmation token。
4. Octop 返回的执行结果必须先进入 Org Engine verifier，再更新 TaskContract。
5. 连接失败、版本不兼容和权限拒绝分别映射为可恢复状态。
6. 用 fake Octop adapter 和隔离实例分别测试。

Create:

- engine/personal/adapters/octop.py
- engine/personal/adapters/octop_test.py
- editor/backend-server/src/personal/octop.routes.ts
- editor/docs/integration/octop-adapter.md

Modify:

- engine/personal/envelopes.py
- editor/backend-server/src/personal/task-envelope.ts

验收：Org Engine 可以使用 Octop 执行一个低风险本地任务；高风险动作不能绕过 Org Engine 的确认和验证。

### Phase 5 - Tools, permissions and verification

目标：工具可用，但每个动作有边界、有证据、有撤销说明。

#### P5.1 Create tool registry

1. 定义工具名称、输入 schema、输出 schema、risk level、required scopes 和 verifier。
2. 先注册 read_file、read_document、create_draft、create_reminder。
3. 默认不注册 send、delete、submit、payment。
4. 每次调用保存参数 hash 和结果 hash。
5. 工具描述写明什么时候使用，不只写能做什么。

Create:

- engine/personal/tools/registry.py
- engine/personal/tools/contracts.py
- engine/personal/tools/registry_test.py

验收：未注册工具无法被模型调用。

#### P5.2 Add permission gate

1. 在执行前检查 user rule、workspace scope、risk level 和 confirmation token。
2. token 必须绑定 task id、action id 和参数 hash。
3. 修改参数后 token 失效。
4. 过期 token 不能重放。
5. 所有拒绝原因对用户可读。

Create:

- engine/personal/permission_gate.py
- engine/personal/permission_gate_test.py
- editor/backend-server/src/personal/confirmation.routes.ts

验收：点击确认只批准当前动作，不批准未来同类动作。

#### P5.3 Add tool verifiers

1. read_file 验证文件仍存在且 hash 未变化。
2. create_draft 验证草稿文件确实存在并可读取。
3. create_reminder 验证提醒记录已写入。
4. 不接受模型返回“已完成”作为证据。
5. verifier 失败时状态为 executed_unverified 或 blocked，不是 done。

Create:

- engine/personal/tools/verifiers.py
- engine/personal/tools/verifiers_test.py

验收：删除执行结果文件后重新验证，系统显示未完成或不可验证。

P5.4 至 P5.6 是 Alpha 的代表性验收场景。它们用于检验共享事务流程，不是只允许实现这三类事务的白名单。新增事务类型必须复用 TaskContract、IntentEnvelope、工具权限、Evidence、确认和 Verifier 约定。

#### P5.4 Implement local files and spreadsheet capability pack

1. 扫描用户授权的文件夹，不越过 workspace scope。
2. 读取文档标题、来源、页码、表格列名、公式和截止日期。
3. 生成材料摘要、待办、未确定项和重复项，并为每条结论保留来源。
4. 支持“整理表格”“合并同类项”“生成汇总表”等可预览操作，原文件默认只读。
5. 生成个人草稿和提醒候选，不自动外发、提交或删除。

Create:

- engine/personal/scenarios/material_commitment.py
- engine/personal/scenarios/material_commitment_test.py
- editor/frontend/src/views/PersonalTaskView.tsx

验收：用十份包含歧义、重复、过期、敏感和不可读文件的 fixture 完成一次事务；整理后的新文件可打开，原文件未被修改。

#### P5.5 Implement weather reminder capability pack

1. 只在用户明确开启天气来源并选择地点后启用。
2. 查询温度、体感温度、降雨和预警，并保存来源、时间和地点。
3. 将天气事实与用户偏好（例如怕冷、通勤方式、是否携带雨具）分开显示。
4. 生成提醒候选，默认先在应用内提醒，不自动发送给第三方。
5. 天气接口失败、数据过期或地点不明确时，显示需要补充的信息，不猜测。

验收：使用冻结天气 fixture、过期数据、地点歧义和断网场景；任何提醒都能追溯到天气来源和用户已确认偏好。

#### P5.6 Implement travel planning capability pack

1. 从自然语言提取目的地、日期、人数、预算、住宿偏好和不可接受条件。
2. 缺失关键字段时只提出最少的澄清问题，不凭空补齐。
3. 在用户单独授权的旅行连接器中查询酒店，保存价格、房型、取消政策和查询时间。
4. 先生成候选比较和行程草案，价格或库存变化必须重新查询。
5. 首期只允许“查看和生成方案”；预订、提交和付款必须进入独立确认步骤。
6. 订单完成后必须用真实订单号或连接器回执验证，不能依据页面口头文本显示完成。

验收：模拟价格变化、库存消失、取消政策冲突、连接器失败和用户取消；任何未确认方案不得创建真实订单。

#### P5.7 Define capability-pack onboarding and composition

1. 建立 capability-pack schema，必须包含 ID、版本、适用事务、required_fields、tool_refs、required_scopes、risk、confirmation_policy、evidence_requirements 和 verifier_refs。
2. 校验工具和验证器引用确实存在；能力注册复用 P5.1 的工具注册表，不建立另一套工具系统。能力描述不得降低工具自身的风险、权限和确认要求。未启用、缺少连接器或权限的能力不能成为可执行候选。
3. 把 P5.4 至 P5.6 注册为能力描述；新增事务通过注册进入候选集，不在理解层写死“文件、天气、旅行”三个分支。
4. 用一个测试日程能力复用 create_reminder，用户输入“明天上午9点提醒我带体检报告”即可办理；验证生成记录的日期、时区和内容。这个样本只验证接入方式，后续日程功能按使用价值扩展。
5. 为组合事项声明步骤依赖和结果引用；只传递已验证且在授权范围内的结果，分别记录计划、确认、执行和验证状态。
6. 验收组合请求“把这些材料中的待办整理成表，并把已确定的截止事项设为提醒”；模糊日期先询问，提醒创建失败时保留已生成文件并显示部分完成，重试不能重复创建已验证的结果。
7. 停用测试能力，重复同一请求；系统说明暂不可办理，并保留查看、取消或用户选择后保存待办的路径。不能假装已安排，也不能未经用户同意换外部服务。

Create:

- editor/schema/personal/capability-pack.schema.json
- engine/personal/capabilities/registry.py
- engine/personal/capabilities/registry_test.py
- editor/docs/personal/capability-pack-contract.md

Modify:

- engine/personal/execution_router.py
- engine/personal/intent.py
- engine/personal/envelopes.py
- editor/backend-server/src/personal/task-envelope.ts

验收：接入测试日程能力不需要改写三个场景的判断分支；组合事项共享上下文并逐步验证，用户通过同一个自然语言入口操作。

### Phase 6 - Sandbox, replay and personal eval

目标：先试办，再执行；新规则必须证明不会破坏用户习惯。

#### P6.1 Add simulation mode

1. 为 TaskContract 创建 isolated run directory。
2. 所有写操作重定向到模拟目录。
3. 外部工具替换为 fake tool。
4. 输出 action diff、risk summary 和 expected evidence。
5. 清晰标记 simulated，不生成真实完成证据。

Create:

- engine/personal/sandbox.py
- engine/personal/sandbox_test.py
- editor/backend-server/src/personal/simulation.routes.ts

验收：模拟创建草稿不会出现在真实工作区，模拟发送不会产生网络请求。

#### P6.2 Add replay records

1. 保存输入 envelope、状态快照、模型版本、policy 版本和 tool receipts。
2. 支持从任一决策前节点重放。
3. 支持 deterministic fake provider。
4. 对比旧版本和新版本的动作、询问和证据。
5. 不在回放中调用真实高风险工具。

Create:

- engine/personal/replay.py
- engine/personal/replay_test.py
- editor/backend-server/src/personal/replay.routes.ts

验收：同一 replay 在 fake provider 下输出稳定；高风险动作全部被模拟。

#### P6.3 Add personal eval runner

1. 用 PersonalEvalCase 定义用户可接受行为。
2. 支持 must_ask、must_not_do、must_cite 和 acceptable_actions。
3. 每次 policy/model/rule 变更运行个人回归集。
4. 输出通过率、回归项和差异 trace。
5. 失败时禁止自动启用新版本。

Create:

- engine/personal/eval_runner.py
- engine/personal/eval_runner_test.py
- editor/backend-server/src/personal/eval.routes.ts
- editor/frontend/src/views/PersonalEvalView.tsx

验收：新增一个“绝不自动发送”的回归用例后，任何绕过该规则的版本都不能标记为 ready。

#### P6.4 Add user-facing preview

1. 事项页先显示“计划做什么”。
2. 分组显示依据、风险、缺失信息和会改变的文件。
3. 让用户只确认一项动作。
4. 显示撤销方法。
5. 执行完成后显示真实证据链接。

Modify:

- editor/frontend/src/views/PersonalTaskView.tsx
- editor/frontend/src/components/personal/

验收：用户无需看日志就能判断“系统准备做什么”和“是否真的做完”。

### Phase 7 - Learning and controlled self-improvement

目标：越用越了解用户，但不让系统暗中改写人格或权限。

#### P7.1 Collect behavior signals

1. 记录 accepted、edited、rejected、revoked 和 repeated_correction。
2. 记录修改前后 action 和文本 diff。
3. 脱敏后再写入学习事件。
4. 高敏感信息只保存事件类型，不保存原文。
5. 每个事件关联 task、trace 和 evidence。

Create:

- engine/personal/learning/signals.py
- engine/personal/learning/signals_test.py
- editor/backend-server/src/personal/learning.store.ts

验收：一次用户修改可以完整追溯到原任务，但不能泄露敏感正文。

#### P7.2 Generate learning proposals

1. 只有重复且一致的行为才生成候选规则。
2. 单次拒绝不自动推断长期偏好。
3. 对每个提案显示例子、影响范围、反例和风险。
4. 高敏感规则必须人工批准。
5. 规则默认 proposed，不直接 active。

Create:

- engine/personal/learning/proposer.py
- engine/personal/learning/proposer_test.py
- editor/frontend/src/views/PersonalLearningView.tsx

验收：用户能看到“为什么建议这条规则”，并能拒绝而不影响任务。

#### P7.3 Add versioning and rollback

1. 为事实、规则、policy 和提示模板保存版本。
2. 应用学习提案生成 immutable version。
3. 回归集通过后才允许启用。
4. 回滚恢复旧版本并保留审计事件。
5. 回滚后重新执行同一任务时使用旧版本。

Create:

- engine/personal/learning/versioning.py
- engine/personal/learning/versioning_test.py
- editor/backend-server/src/personal/learning.routes.ts

验收：批准、应用、回滚三个状态在刷新和重启后都保持一致。

#### P7.4 Explicitly defer model fine-tuning

1. 统计足够的高质量行为信号。
2. 先比较路由、检索、规则和提示改进。
3. 只有个人 eval 稳定后再做 LoRA/蒸馏实验。
4. 微调数据必须用户明确选择并可导出。
5. 微调模型必须和原模型并行回放后才能替换。

Create:

- docs/personal-learning-policy.md
- docs/model-adaptation-gates.md

验收：文档明确“学习规则”与“训练模型”的边界。

### Phase 8 - Small-user UI

目标：纯小白能够完成首次成功任务。

#### P8.1 Build first-run flow

1. 启动后只询问工作区、模型和隐私边界。
2. 用三个选择建立初始权限：只读、可生成草稿、可设置提醒。
3. 显示默认禁止项：发送、删除、付款、提交。
4. 用一个本地样例完成预演。
5. 提供跳过高级配置的路径。

Create:

- editor/frontend/src/views/PersonalOnboardingView.tsx
- editor/frontend/src/components/personal/PermissionSetup.tsx

验收：新用户五分钟内完成首个模拟任务，无需终端命令。

#### P8.2 Build home and task card

1. 首页主入口为“我要办一件事”。
2. 显示进行中、待确认、已完成和需要关注的事项。
3. 事项卡显示目标、下一步、风险和证据状态。
4. 复杂度和内部执行角色不显示在默认视图。
5. 提供查看依据和撤销入口。

Create:

- editor/frontend/src/views/PersonalHomeView.tsx
- editor/frontend/src/components/personal/TaskCard.tsx
- editor/frontend/src/components/personal/EvidencePanel.tsx

验收：用户能从首页判断下一步，而不是被日志淹没。

#### P8.3 Build rules and privacy views

1. 规则页用“我希望你总是/从不/先问我”表达。
2. 每条规则显示来源和生效范围。
3. 记忆页支持查看、修改、删除和导出。
4. 隐私页显示本地文件、模型、网络和外部连接状态。
5. 所有危险默认值可视化。

Create:

- editor/frontend/src/views/PersonalRulesView.tsx
- editor/frontend/src/views/PersonalMemoryView.tsx
- editor/frontend/src/views/PrivacyView.tsx

验收：小白能理解系统知道什么、依据什么、会做什么。

#### P8.4 Keep advanced console

1. 将组织、工作流、学习洞察和运行事件保留在高级模式。
2. 高级模式显示 trace id、policy version 和 raw evidence refs。
3. 支持从事项页跳到高级诊断。
4. 默认用户流程不依赖高级模式。
5. 人工验收覆盖默认模式和高级模式。

Modify:

- editor/frontend/src/router.tsx
- editor/frontend/src/layouts/
- editor/frontend/src/views/StudioView.tsx

验收：开发者没有失去调试能力，普通用户不会被内部模型暴露。

### Phase 9 - Integration and packaging

目标：把本地个人助理交付为可安装、可升级、可恢复的产品。

#### P9.1 Add packaged data paths

1. 区分开发目录、安装目录和用户数据目录。
2. 个人 SQLite 和 evidence 不写入 asar 或安装包。
3. 首次启动创建数据目录和权限说明。
4. 迁移旧版本 personal schema。
5. 打包后重启验证数据仍在。

Modify:

- editor/electron/
- editor/backend-server/src/config.ts
- editor/electron-builder.yml

验收：安装包更新不会覆盖用户个人状态。

#### P9.2 Add MCP with safe surface

1. 只暴露 list_tasks、get_task、get_evidence、simulate_task 和 propose_action。
2. 发送、删除、付款和提交暂不暴露。
3. 所有 MCP 调用携带 user/session scope。
4. MCP 返回 trace 和 evidence refs。
5. 用真实 MCP client 进行 initialize、tools/list 和工具调用。

Modify:

- editor/backend-server/src/mcp/mcp-stdio.ts
- editor/backend-server/src/mcp/
- editor/docs/mcp-personal-assistant.md

验收：MCP 客户端不能绕过 RuleEngine 或确认 token。

#### P9.3 Add bridge integration

1. Bridge 只注入启动和事件采集能力。
2. 个人状态存放在用户选择的数据目录。
3. 不把全部 shell 或对话日志自动转成个人事实。
4. 安装、升级和卸载都有备份。
5. 用 disposable config 完成完整验证。

Modify:

- bridge/
- lean-hooks/
- docs/bridge-personal-assistant.md

验收：Bridge 失败不会阻断主应用，也不会破坏现有用户配置。

## Test strategy

### Test pyramid

1. Schema tests：字段、枚举、版本和无效输入。
2. Unit tests：RuleEngine、DecisionPolicy、Provider、Verifier、Replay。
3. Backend API tests：事务、权限、审计、错误状态和重启。
4. Python integration tests：TaskEnvelope、Org Engine adapter、fake provider。
5. Frontend tests：事项卡、确认、证据、规则和空状态。
6. Playwright tests：首次启动、导入文件、预演、确认、失败和回放。
7. Manual QA：真正以小白用户完成任务，不接受只看代码或只看单元测试。

### Required test fixtures

建立以下隔离夹具：

- empty workspace
- ten-document inbox
- ambiguous deadline
- duplicate documents
- sensitive document
- expired commitment
- unreadable file
- missing local model
- malformed model output
- blocked external send
- verifier failure
- user edit followed by rollback
- multi-turn intent update and ambiguous reference
- test calendar capability enabled and disabled
- composite task partially completed and retried

### Core quality metrics

每次 eval 和人工验收都记录：

- 无依据事实率。
- 未授权执行率。
- 高风险动作拦截率。
- 真实完成证据率。
- 用户纠正次数。
- 用户拒绝率。
- 返工次数。
- 平均澄清次数。
- 个人回归集通过率。
- 本地推理延迟。
- 内存占用。
- 任务失败后的恢复率。

首个 alpha 的门槛：

| 指标 | 门槛 |
| --- | --- |
| 未授权高风险动作 | 0 |
| 无证据事实升级 | 0 |
| 模拟动作污染真实工作区 | 0 |
| 完成状态无验证证据 | 0 |
| 个人回归集 | 100% |
| 首次任务可完成率 | 80% 以上 |
| 用户能解释系统下一步 | 80% 以上 |
| 本地模型不可用时静默联网 | 0 |

## Manual user acceptance plan

执行模型必须按以下顺序真实操作，不得用 API 代替可见用户路径：

### MUA-01 First launch

1. 启动开发版或安装版。
2. 不读源码，只按屏幕提示选择本地模型和工作区。
3. 确认默认权限为只读。
4. 确认首页显示“我要办一件事”。
5. 截图记录首次体验和任何技术术语。

### MUA-02 First successful local task

1. 将十份测试材料放入授权 inbox。
2. 输入“帮我整理这些材料，列出我需要处理的事情，并生成一份汇总表”。
3. 检查系统是否先生成目标和完成标准。
4. 检查每条事实是否有来源。
5. 检查歧义是否进入待确认。
6. 在沙盒执行预演。
7. 确认只生成新汇总文件、草稿和提醒候选，原文件没有被修改。
8. 打开生成的表格并查看真实完成证据。
9. 补充“把表里已确定的截止事项设为提醒”，检查只使用有来源且日期确定的事项；模糊日期先询问。
10. 在隔离夹具中模拟提醒创建失败，确认文件仍可打开、事项显示部分完成；重试后只补办未完成步骤。

### MUA-03 Weather reminder

1. 开启天气来源并选择一个地点。
2. 输入“明早提醒我根据天气准备出门”。
3. 检查系统显示天气来源、更新时间和使用的个人偏好。
4. 模拟低温、降雨、过期数据和断网。
5. 确认数据不可用时系统不会编造天气，也不会静默联网替代。
6. 确认提醒可以关闭、修改和查看依据。
7. 在已接入测试日程能力的验收版本中输入“明天上午9点提醒我带体检报告”，确认复用同一入口和提醒记录验证。
8. 停用该能力后重复请求，确认显示暂不可办理；用户取消后没有新提醒记录。

### MUA-04 Travel planning and permission boundary

1. 输入“帮我订一个下周去上海的酒店”，但不提供日期、预算和入住人。
2. 确认系统先询问缺失信息，而不是自行猜测。
3. 检查酒店候选显示价格、房型、取消政策、来源和查询时间。
4. 确认没有独立确认前不会下单或付款。
5. 修改日期、房型或价格后确认旧 token 失效。
6. 取消任务并检查没有订单创建或付款记录。
7. 新建规划事项并补充“改成周五”“便宜一点”，检查只更新当前事项；“周五”有多种日期解释时先询问。
8. 同时打开两个酒店事项，再输入“刚才那个酒店”，确认无法唯一指代时询问，而不是更新任意一个事项。

### MUA-05 Learning

1. 连续三次修改同一类草稿格式。
2. 检查系统是否提出学习规则而非静默修改。
3. 查看支持案例、反例和影响范围。
4. 批准规则。
5. 运行个人回归集。
6. 回滚规则并重新执行。

### MUA-06 Failure and recovery

1. 停止本地模型。
2. 提交一个新任务。
3. 确认界面显示本地模型不可用。
4. 确认没有云端请求。
5. 恢复模型后重试。
6. 检查任务状态、trace 和 evidence 没有重复。

### MUA-07 Restart and export

1. 重启 backend。
2. 重启 Electron 应用。
3. 重启系统后重新打开事项。
4. 导出个人代理包。
5. 清空测试数据目录副本。
6. 导入导出的代理包。
7. 确认事实、规则、eval case 和版本可以恢复。

## Delivery order and ownership

每个执行模型领取任务时使用下列格式：

~~~text
Task ID:
Goal:
Allowed files:
Dependencies:
Implementation steps:
Tests:
Acceptance evidence:
Do not change:
~~~

模型完成任务时必须返回：

~~~text
Task ID:
Changed files:
Commands run:
Test results:
Manual evidence:
Known risks:
Next dependency:
~~~

推荐分工：

| 执行单元 | 负责范围 |
| --- | --- |
| Baseline fixer | Phase 0，不能改个人领域 |
| Schema engineer | P1.1、P1.2 |
| Evidence engineer | P1.3、P5.3 |
| Local model engineer | Phase 2 |
| Decision engineer | Phase 3 |
| Orchestration engineer | Phase 4 |
| Tool safety engineer | P5.1、P5.2 |
| Intent engineer | P2.5，多轮理解与事项上下文 |
| Capability engineer | P5.7，能力接入与组合事项 |
| Replay/eval engineer | Phase 6 |
| Learning engineer | Phase 7 |
| Product UI engineer | Phase 8 |
| Packaging engineer | Phase 9 |
| QA model | 全部 MUA 和回归矩阵 |

每个阶段结束必须有一次架构审查，审查问题固定为：

1. 是否复制了现有能力而不是复用？
2. 是否有模型输出绕过规则或验证器？
3. 是否把用户陈述误当成外部事实？
4. 是否把模拟结果误标成真实完成？
5. 是否新增了未授权的网络或文件范围？
6. 是否让普通用户必须理解 Agent 术语？
7. 是否可以在断网和模型失效时安全运行？
8. 是否有可回放的 evidence 和 trace？

## Definition of done

只有全部条件成立，才把首个 alpha 标记为完成：

1. Phase 0 的运行、导出、Bridge 和主线问题已有可复现结果。
2. 个人领域 schema、SQLite、API 和审计链通过测试。
3. 至少一个本地模型可离线完成文件/表格首个场景；天气和旅行在外部数据不可用时安全降级。
4. 用户可以用自然语言开始不同类型的个人事务、连续补充和修改；Alpha 的代表性场景通过率达标，且未支持的请求会明确告知。
5. 没有证据的事实不会进入已确认状态。
6. 没有授权的高风险动作无法执行。
7. 沙盒预演不会污染真实工作区。
8. 失败任务可以恢复、取消和回放。
9. 用户行为只生成 LearningProposal，不会静默修改规则。
10. 规则、policy 和模型版本可以回滚。
11. 小白通过 MUA-01 到 MUA-07，包括能力接入、多轮修改和组合事项的验收步骤。
12. MCP、Electron 和 Bridge 不绕过同一套权限边界。
13. org-engine-editor 没有继续发展第二条重复主线。

## Kill criteria

出现以下任一情况时暂停扩展功能，回到基础架构：

- 仍存在任何未授权高风险动作。
- 运行状态、导出状态或安装状态对用户撒谎。
- 个人状态无法导出或删除。
- 个人回归集不能阻止新规则破坏旧习惯。
- 小模型只能靠静默调用云端才能完成关键路径。
- 首个垂直场景需要用户理解 Agent、Skill 或 Workflow。
- 为了展示“贾维斯”而把天气、旅行、文档做成三个没有共同事务内核的功能孤岛。
- 项目开始和 Octop 竞争连接器、IM、远程桌面数量，而没有形成决策层价值。

## Final recommendation

这个方向值得做，面向用户的产品定义是：

> 一个本地运行、理解连续表达、按个人习惯处理日常事务的助理；用户用自然语言交代事情，可以随时修改条件、查看进度和确认结果。

支撑这一体验的技术优势是个人决策层：把用户的规则、证据、授权和历史选择编译成可回放的个人代理包。能力按统一约定接入，既可以单独使用，也可以组合办理一件事。

Octop 可以作为兼容的执行后端、连接器来源和竞品基线；它不是需要被复制的完整产品。Org Engine 的现有优势在于组织编排、审计、反馈和学习闭环，下一步应把这些能力从“开发者组织管理”转译成“普通用户的个人事务闭环”。资料/表格整理是离线起点，天气提醒验证主动能力，旅行规划验证受控外部连接；实际预订与付款必须在证据、确认和验证成熟后再开放。
