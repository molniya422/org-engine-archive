# Laya + Octop + Org Engine 个人事务助理复盘

日期：2026-10-04

## 结论先行

### 产品是否有必要

有必要，但不是再做一个“本地多 Agent 助手”。Octop 已经覆盖了本地/私有部署、模型接入、Connector/MCP、记忆、工作区、浏览器自动化、远程桌面、IM 通道、定时任务和多专家运行时。继续复制这些能力，产品没有清晰优势。

建议把内部技术定位为：

> 建在本地 Agent 执行底座之上的个人决策安全层：把用户的目标、事实、规则、依据、授权和完成证据组织成可回放的个人代理包。

面向用户的产品形态是“处理日常个人事务的贾维斯”：用户用自然语言交代日程提醒、资料整理、出行预约、家庭杂务、个人沟通和表单处理等事务，系统结合当前对话和已确认偏好理解意图，完成可验证的事务闭环。订酒店、按天气提醒穿衣、整理表格或文档是代表性例子，不构成功能边界。重点是少问但问对、知道哪些信息缺失、尊重用户边界，以及不把猜测当成完成。

用户不需要理解 Agent、Skill、Department、Workflow、Gateway 或 Org。用户只看到：

- 要办什么事
- 系统依据什么
- 准备做什么
- 有什么风险
- 哪一步需要确认
- 是否真的完成，以及完成证据在哪里

### 是否可行

技术上可行，实施需要分阶段验证。首个 Alpha 用三个代表性场景验证通用事务内核；三个场景是验收样本，产品能力后续按日常使用价值扩展：

1. 本地文件和表格整理：离线读取授权文件，生成可预览的新文件、摘要、待办和草稿。
2. 天气驱动的个人提醒：用户开启天气来源并选择地点后，根据有来源的天气数据和已确认偏好生成应用内提醒。
3. 旅行事务规划：提取目的地、日期、预算和偏好，查询并比较酒店；首期只生成方案，预订/付款要在后续阶段逐步开放。

资料整理是离线起点，天气提醒验证主动服务能力，旅行规划验证受控外部连接。三者及后续能力都必须经过“理解事务 -> 补齐信息 -> 计划 -> 确认 -> 执行 -> 验证 -> 学习提案”的同一闭环。能力也应能组合：例如从出差资料提取日期、比较酒店，再设置出发提醒；各步骤共享事项上下文，但分别验证执行结果。

首期按已验证能力交付，模型权重保持固定，外部连接按需授权；预订、发信、付款、删除或提交必须经过独立确认和结果验证。后续扩展的重点是日常事务覆盖率、连续理解和实际完成率。

## 外部事实：Laya 的正确定位

本次读取的官方模型卡：

- https://www.modelscope.cn/models/convaiinnovations/laya
- https://www.modelscope.cn/models/convaiinnovations/laya.md

官方资料显示：

| 项目 | 结论 |
| --- | --- |
| 模型类型 | `text-classification`，非自回归 typed-decision 模型 |
| 参数量 | `421.3M`，Apache-2.0 |
| 输入输出 | 输入 state 和 typed questions，输出 choice/score/noul 等结构化答案与概率 |
| 生成能力 | 不生成自然语言，因此可以避免“生成式文本幻觉”；但错误分类、错误概率和错误路由仍然可能发生 |
| JEV 关系 | `laya-serve` 提供 JEV 兼容的 `/v1/systemone` 形状，可作为 DecisionPolicy 的实现，不等于 Laya 是完整 Agent |
| 中文 | 根模型 `laya` 面向英文；中文产品应显式选择 `laya-multilingual`，不能把英文根模型当中文默认模型 |
| 性能 | 官方声称单问题 GPU 约 33-40ms；CPU、显存、冷启动和本机实际数据必须单独测量 |
| 关键限制 | 基础模型在 typed-decisions 基准约 `0.362`；`0.766` 属于专门微调的 `laya-typed-decisions`，不能当作通用准确率 |
| 风险 | 官方模型卡指出高基数选项、score、noul 偏置、过度自信和需要温度校准；概率不能直接等同事实真值 |

因此：

1. 可以按用户要求把 Laya 作为 JEV-compatible decision provider。
2. 不要让 Laya 生成解释、事实、邮件或工具参数。
3. Laya 只负责有限问题：意图分类、候选排序、风险分级、是否需要澄清、是否触发某类规则。
4. 硬规则、权限、用户确认、执行回执和验证器拥有最终控制权。
5. 中文 MVP 的模型配置至少要有 `laya-multilingual`；`laya` 根模型只作为英文基线，不得静默用于中文任务。
6. Laya 的 confidence 只能作为路由信号，不能单独成为放行条件；需要在用户数据上做校准和个人回归测试。

## 当前目录的真实构成

### 1. `org-engine`：唯一推荐的主线

关键路径：

- `D:/claude-ecosystem/org-engine/engine/harness/organization_orchestrator.py`
- `D:/claude-ecosystem/org-engine/engine/harness/multiagent_orchestrator.py`
- `D:/claude-ecosystem/org-engine/engine/harness/orchestrator_adapter.py`
- `D:/claude-ecosystem/org-engine/engine/learning/`
- `D:/claude-ecosystem/org-engine/editor/backend-server/`
- `D:/claude-ecosystem/org-engine/editor/frontend/`
- `D:/claude-ecosystem/org-engine/bridge/`

可复用能力：

- 分层组织、部门边界、合同版本、通信治理
- 人工网关、否决和升级
- `did/how/evidence` 责任链和 Skill 证据审计
- 产品 key 门禁和审计日志
- 学习事件、反馈聚合、提案生成、回滚思路
- 预算、状态、失败模式和 Loop 治理
- React 编辑器、运行监控、学习提案批准/拒绝/回滚 UI

不能误判为已完成的能力：

- `orchestrator_adapter.py:308-336` 的 L2 会议仍使用固定 `APPROVE/PASS/APPROVE`。
- `e2e_small_sample.py` 明确使用 deterministic local agent stub。
- 角色执行、真实模型调用、工具回执、完成验证尚未形成可信生产闭环。
- `organization_orchestrator.py:822-834` 的 `deliberate()` 含固定 feasibility/budget 值。
- 适配器最终发送的 product key 事件不等于已经调用真实 `issue_product_key()`。

正确定位：Org Engine 是个人决策安全层的原型内核，不是完整 Agent 运行时。

### 2. `org-engine-editor`：重复主线，停止继续开发

证据：

- 与 `org-engine/editor` 有约 270 个相同相对路径文件。
- 两边都有 React 前端、Fastify backend、Electron、MCP、workflow、playbook、run manager 和测试。
- 两套代码已经发生分叉，不能继续把两边都当作主线。

处理方式：

1. `org-engine/editor` 作为唯一主线。
2. `org-engine-editor` 改成只读兼容/归档说明；需要迁移的功能先列差异清单，再一次性合并。
3. 新功能禁止同时提交到两个编辑器目录。
4. 不要通过复制文件解决分叉；只保留一份实现。

### 3. `lean-hooks`：通用 Hook/反馈基础设施

关键路径：

- `D:/claude-ecosystem/lean-hooks/harness/`
- `D:/claude-ecosystem/lean-hooks/training-loop/`
- `D:/claude-ecosystem/lean-hooks/hooks/`

它适合复用：

- SessionStart/UserPromptSubmit/Stop hook
- SQLite session log
- SkillOpt、MultiAgentOpt、ToolCallOpt 指标
- Loop budget、failure detector、audit log
- 可插拔 hook 机制

它不应直接成为个人事实库。对话日志、技能触发信号和用户明确确认不是同一类数据，不能自动升级成“用户偏好”或“用户事实”。个人助理要新增独立的 personal schema、来源、敏感级别和过期时间。

### 4. 根目录 `orchestrator/` 与 `org-engine/archive/`

这些是较早的通用多 Agent 图编排或历史实现，有独立测试但不是当前产品主线。保留作为历史参考和迁移来源，不再新增功能，不与 `engine/harness` 并列维护。

当前根 `orchestrator` 的默认测试还暴露了包路径问题：在自身目录直接运行会因 `ModuleNotFoundError: orchestrator` 失败；设置 `PYTHONPATH=D:/claude-ecosystem` 后 37 个测试通过。这属于历史基础设施问题，不应被包装成个人助理能力。

### 5. `taste-skill`

它是可移植的前端视觉/交互 Skill，适合作为个人助理小白 UI 的设计资产，不是运行时、模型、记忆或安全能力。可以复用规范和组件设计思路，但不能把它当作业务内核。

### 6. 根目录其它目录

`config/`、`memory/`、`training-loop/`、`tools/`、`skills/`、`docs/`、`reports/` 和 `projects/` 主要是共享配置、历史资料、自动化脚本、技能与测试资产。它们不能替代产品自己的版本化数据层。新增个人数据必须有明确的 source of truth。

## 与 Octop 的边界

Octop 负责执行能力，Org Engine 负责个人决策与授权能力。两边通过版本化协议连接，不直接共享数据库。

| 能力 | Octop | Org Engine personal layer |
| --- | --- | --- |
| 本地模型加载和模型路由 | 负责 | 只声明何时需要模型以及结果是否可用 |
| MCP、Connector、OAuth | 负责 | 决定是否允许、是否需要确认 |
| 浏览器、远程桌面、IM | 负责 | 默认禁止或逐项授权 |
| 工作区和工具执行 | 负责 | 限定目录、敏感范围、任务合同和沙盒 |
| 普通会话记忆 | 负责 | 不直接当作个人事实 |
| 用户事实、偏好、禁忌 | 不负责本产品语义 | 唯一来源 |
| 决策 trace、证据、确认 token | 不负责本产品语义 | 唯一来源 |
| 回放、个人回归集、学习提案 | 可提供执行回执 | 唯一来源 |
| 最终高风险放行 | 工具层护栏 | 用户确认 + RuleEngine 双重门禁 |

协议方向必须是：

```text
用户目标
  -> Org Engine: TaskContract + EvidenceRefs + DecisionTrace
  -> Octop: approved TaskEnvelope
  -> Octop: ToolReceipt
  -> Org Engine: Verifier -> verified/unverified/blocked
  -> LearningProposal（永远先提案，不静默改变）
```

不要复制 Octop 的模型、Connector、浏览器、IM、Memory、workspace 或控制台实现。

## 新产品的最小架构

```text
小白输入一句话
  -> 本地生成式模型：提取事务意图、实体和缺失字段
  -> TaskContract：目标、范围、完成标准、禁止动作
  -> EvidenceStore：文件/用户陈述/工具回执/验证证据
  -> Laya DecisionPolicy：有限候选的分类、评分、风险和澄清路由
  -> RuleEngine：硬约束、权限、敏感操作、预算
  -> Simulation：只写隔离目录，不产生真实完成证据
  -> User Confirmation：动作和参数变更后 token 失效
  -> Octop Executor：执行已批准 envelope
  -> Verifier：检查真实文件、回执、hash、状态
  -> DecisionTrace：可回放、可导出、可撤销
  -> LearningProposal：展示案例、反例、影响范围，等待批准
```

核心的 `IntentEnvelope` 需要把自然语言压成可校验字段：事务类型、目标、地点、时间、人数、预算、偏好、不可接受条件、缺失信息和置信度。生成式模型只负责理解与改写，Laya/JEV 只负责有限候选的分类、排序和澄清路由；规则、连接器返回的事实、用户确认和验证器不能被模型覆盖。这个边界是小模型仍然能“明白用户意思”的关键。

Laya 不负责：自由文本回答、事实创造、权限放行、工具调用、执行完成判断。

建议第一批领域对象：

- `UserFact`：值、来源、置信度、敏感级别、有效期、撤销状态
- `UserRule`：触发条件、动作、优先级、来源、版本、状态
- `TaskContract`：目标、允许范围、成功标准、禁止动作、所需证据
- `Evidence`：定位、hash、捕获时间、来源类型、支持的事实/决策
- `ActionProposal`：动作类型、参数、风险、回滚方式、确认要求
- `DecisionTrace`：候选、选中项、拒绝原因、policy/rule/evidence 版本
- `ToolReceipt`：Octop 返回的工具调用、结果、时间和执行环境
- `LearningProposal`：接受/修改/拒绝/撤销信号与候选规则变更
- `PersonalEvalCase`：必须询问、禁止执行、必须引用的个人回归用例

所有对象先固化为 JSON Schema，再生成 TypeScript/Python 类型。个人状态只写入独立 SQLite，不能散落在 localStorage、临时 JSON 和 Python 全局变量中。

## 小模型不足的解决方案

按这个顺序补偿，不要先训练模型：

1. 生成式本地模型只做结构化提取和候选生成。
2. Laya 把开放问题压成有限 typed questions。
3. RuleEngine 执行不可被模型覆盖的硬规则。
4. 检索只提供经过来源筛选的事实和历史案例。
5. 长任务拆成短 TaskContract，每一步保存状态。
6. 多候选并行只用于独立证据或独立工具，不因“多 Agent”标签拆任务。
7. Verifier 以文件、hash、工具回执和外部状态为准，不接受模型口头声称。
8. Replay/Eval 在启用新规则或模型前跑用户自己的历史案例。
9. 有足够高质量信号后再考虑 LoRA/蒸馏；训练数据必须由用户选择、导出和删除。

不能承诺“没有幻觉”。可以承诺并验证：

> 没有证据不升级为事实；没有授权不执行；没有验证不显示完成。

## 实施顺序

### P0：统一主线与恢复真实基线

目标：在新增个人能力前，先让当前产品的运行状态诚实。

步骤：

1. 锁定 `org-engine/editor` 为唯一编辑器主线。
2. 记录 `npm test`、Python tests、backend/frontend/Electron build、真实浏览器人工验收结果。
3. 修复 adapter 启动目录和 Python 入口，避免 UI 长时间 Starting。
4. 修复 YAML/JSON 导出，失败时不能显示成功。
5. 修复 Bridge 安装器对不存在 `bridge/harness`、`bridge/training-loop`、`bridge/templates` 的错误引用，并让安装器检查复制数量。
6. 明确 Electron 开发模式、打包模式和用户数据目录。
7. 在 `org-engine-editor/README.md` 写明归档状态，停止新功能双写。

额外的 P0 安全/运行门槛：

- backend 当前 CORS 使用 `origin: true` 且没有认证层；在个人数据产品可接受之前，必须绑定 loopback 或增加认证与 workspace scope，不能默认暴露局域网。
- Laya 的 `laya-serve` 官方示例默认绑定 `0.0.0.0`，必须在本产品默认配置中绑定 `127.0.0.1`，或强制 API key；不能因为“本地部署”就默认认为安全。
- RunManager 目前是单个内存活动 run；必须拒绝并发覆盖、可从持久化目录读取历史详情，并真正设置 gateway timeout。
- 所有 Org、Workflow、Proposal ID 必须 basename/allowlist 校验，不能直接拼接到 Windows 文件路径。

完成条件：真实启动、导出、Bridge 安装、取消和重启都有人工证据；状态只有 `running/awaiting_user/done/cancelled/blocked`，且 blocked 必须包含可理解原因和恢复动作。

### P1：个人领域内核

步骤：

1. 建立 `editor/backend-server/src/personal/` 和 `engine/personal/`，不要把个人逻辑塞进 Org CRUD。
2. 建立 SQLite WAL、迁移版本、事务和数据目录策略。
3. 实现上面的九类领域对象和 Schema 校验。
4. 建立证据、事实、规则、任务、动作、trace 的查询/修改/删除/导出 API。
5. 每次写操作记录 audit event，个人状态支持导出和删除。

完成条件：重启后状态完整恢复；导出副本可导入；任何事实可以追到 evidence；敏感数据有 scope 和生命周期。

### P2：LocalModelProvider 与 Laya adapter

步骤：

1. 定义 `LocalModelProvider`，包含 `extract()`、`decide()`、`health()`、`model_version()`。
2. 先实现 deterministic fake provider，用于全部测试。
3. 接入本地生成式模型只做意图/实体 JSON 提取，格式错误时拒绝或澄清。
4. 接入 Laya JEV-compatible `/v1/systemone` 或本地 Python SDK。
5. 默认中文选择 `laya-multilingual`，根 `laya` 只作为英文显式选项。
6. 对 choice、score、noul 分别做校准和个人数据评测；大选项集使用分层选择。
7. 本地模型未安装时只能显示“本地模型不可用”，不得静默云端兜底。

Laya adapter 的最小验证集必须包含：中文输入、英文输入、空问题集、格式错误问题、超过 20 个选项、noul 偏置、低置信度、过度自信、温度校准、断网和模型未安装。Laya 的 `act_probability` 不能单独用于放行，必须以经过个人数据校准的 confidence、规则和人工确认共同决定。

完成条件：断网可运行；模型不可用能安全降级到规则模式/取消；所有模型输出满足 Schema；模型版本和路由原因进入 trace。

### P3：DecisionPolicy、RuleEngine、确认与验证

步骤：

1. 定义 `DecisionPolicy.evaluate(state, candidates, constraints)`。
2. 先实现 baseline 规则策略，再接 Laya 策略，二者可在 replay 中比较。
3. 让规则覆盖风险、权限、敏感字段、预算和禁止动作。
4. 生成不可复用的 confirmation token；动作、参数、证据或规则变更时 token 失效。
5. 实现 `read_file`、`create_draft`、`create_reminder` 的真实 verifier。
6. 明确 `executed_unverified` 与 `verified`，模型返回“完成”不能改变状态。

完成条件：无证据事实率为 0；未授权高风险动作率为 0；模拟不会污染真实目录；删除结果文件后验证能发现未完成。

### P4：Octop 执行适配

步骤：

1. 只建立版本化 `PersonalDecisionProtocol` 和 `TaskEnvelope`，不读写 Octop 数据库。
2. TaskEnvelope 只包含任务合同、允许范围、approved action、evidence refs、policy/rule 版本。
3. 接收 Octop 的 `ToolReceipt`，保存原始回执和脱敏索引。
4. Org Engine 对回执做 verifier，再决定 verified/blocked。
5. 第一阶段先接本地文件、表格、草稿、提醒和只读天气/酒店查询；预订、外发、删除、付款、提交必须保持禁用或逐项确认。

协议 spike 之前必须解决当前已有链路的真实缺口：

- Python adapter 有 `submit_decision`，但 MCP 的 9 个工具没有对应调用，MCP 启动的 Run 无法跨过 gateway。
- adapter 自动生成 `arch_executor`、`fe_executor` 等角色，但静态 registry 并不保证这些角色存在；这会让默认 Run 在 L1 后阻塞。
- 用户保存的 Org YAML 角色和 `bound_skills` 没有成为 Python runtime 的唯一真源，不能把 UI 上的绑定当作真实执行绑定。
- 当前 workflow schema 支持的节点和边明显多于 runtime 实际消费的内容；在定义 `PersonalDecisionProtocol` 前，必须明确 workflow 是图执行器还是通信/会议配置。
- 不允许通过共享 Octop 数据库解决上述问题；只通过 envelope、receipt、trace 和 evidence refs 交互。

完成条件：Octop 不可用时可查看离线事项和回放；Octop 不能绕过 Org Engine 的规则和确认；高风险动作没有有效 token 不能执行。

### P5：代表性场景与日常事务能力接入

P5.1 至 P5.3 是 Alpha 的验收样本。统一入口根据用户意图路由到能力包，普通用户不需要选择 Agent、安装 Skill 或编写 Workflow。

#### P5.1 本地文件和表格整理

1. 用户选择 inbox 并授权只读。
2. 系统读取文档标题、来源、页码、表格列名、公式、截止日期和重复项。
3. 系统把事实、推断、建议和未确定项分开显示。
4. 支持整理表格、合并同类项、生成汇总表等可预览操作，原文件默认只读。
5. 用户在沙盒预演后，只确认生成新文件、草稿或提醒。

#### P5.2 天气驱动提醒

1. 用户明确开启天气来源并选择地点。
2. 查询温度、体感、降雨和预警，保存来源、时间和地点。
3. 将天气事实与用户偏好分开显示，只生成应用内提醒候选。
4. 接口失败、数据过期或地点不明确时澄清或降级，不猜测、不静默换云端。

#### P5.3 旅行事务规划

1. 提取目的地、日期、人数、预算、住宿偏好和不可接受条件。
2. 缺少关键字段时只问必要问题。
3. 通过单独授权的连接器查询酒店，显示价格、房型、取消政策、来源和查询时间。
4. 价格、库存或条件变化时重新查询；首期只生成比较方案。
5. 预订和付款必须独立确认，订单必须用真实回执验证。

#### P5.4 后续能力包接入规范

1. 声明能力 ID、版本、适用事务、必要字段、允许工具、权限范围、风险、确认要求、证据来源和完成验证器。
2. 新能力复用 IntentEnvelope、TaskContract、工具注册表、Evidence 和 Verifier；优先接入 Octop 已有连接器，不另建运行时，能力描述不得降低工具的风险、权限和确认要求。
3. 路由仅考虑当前已启用且可用的能力；不支持的请求说明原因和可办理部分，用户选择后才保存待办。
4. 支持跨能力步骤的依赖和结果引用；只把已验证且在授权范围内的结果传入下一步。一个步骤失败时保留各步骤状态，不能把整个事项显示为完成。
5. 用测试用的日程提醒能力包验证扩展：不修改三类场景的判断分支，用户直接输入“明天上午9点提醒我带体检报告”，生成提醒并验证其记录；能力包停用后明确提示暂不可办理。
6. 后续优先扩展日程、待办、预约准备、沟通草稿和家庭资料管理；每次新增能力都覆盖信息缺失、取消、断网、失败恢复和完成验证。

完成条件：三个代表性场景和测试日程能力共用事项、对话、确认和验证语义；组合事项逐步显示完成证据；小白通过自然语言办理，无需理解内部术语。

### P6：Replay/Eval 和受控学习

步骤：

1. 保存输入 envelope、模型版本、policy 版本、规则版本、状态快照和 tool receipts。
2. 支持 fake provider 下的确定性回放；回放永远不调用真实高风险工具。
3. 支持 `must_ask`、`must_not_do`、`must_cite`、`acceptable_actions`。
4. 用户连续接受/修改/拒绝才生成 LearningProposal。
5. 提案显示支持案例、反例、影响范围和回滚方式，默认 proposed。
6. 回归集通过后才允许应用；应用和回滚都写审计记录。

完成条件：一条“绝不自动发送”的个人规则能够阻止未来版本绕过；规则回滚后同一任务恢复旧行为。

### P7：小白产品层

首页只保留：

- “我要办一件事”
- 进行中
- 待确认
- 已完成
- 需要关注

首次启动只询问工作区、模型和三个权限：只读、生成草稿、设置提醒。发送、删除、付款、提交默认关闭。Org/Workflow 高级控制台保留在开发者模式，不进入默认路径。

## 直接分配给其他模型的任务格式

每个模型只领取一个任务，使用以下格式：

```text
Task ID:
Goal:
Allowed files:
Dependencies:
Implementation steps:
Tests:
Manual acceptance evidence:
Do not change:
Known risks:
```

建议任务拆分：

| Task ID | 负责内容 | 禁止范围 |
| --- | --- | --- |
| P0-A | adapter 启动、blocked reason、取消和重启 | 不改 personal schema |
| P0-B | 导出和 Bridge 安装 | 不改模型/编排语义 |
| P0-C | 主线差异清单和归档说明 | 不复制代码 |
| P1-A | JSON Schema、SQLite、迁移 | 不接真实模型 |
| P1-B | Evidence/Fact/Rule/Trace API | 不接 Octop DB |
| P2-A | fake provider 与 LocalModelProvider | 不实现 Connector |
| P2-B | Laya/JEV adapter 与校准 fixture | 不做聊天生成 |
| P2-C | IntentEnvelope、多轮补充与事项上下文 | 不把临时条件自动写成长期偏好，确认失效联调依赖 P3/P4 |
| P3-A | RuleEngine、confirmation token | 不让模型覆盖规则 |
| P3-B | verifier、sandbox、receipt | 不把口头结果当完成 |
| P4-A | PersonalDecisionProtocol、Octop spike | 不复制 Octop runtime |
| P5-A | 本地文件/表格整理能力包 | 不修改原文件，不做外发 |
| P5-B | 天气提醒能力包 | 不猜测天气，不默认第三方发送 |
| P5-C | 旅行规划能力包 | 首期不下单、不付款，不复制连接器 |
| P5-D | 能力包接入规范、组合事务与日程接入测试 | 不另建运行时，不把场景清单写死，不扩大默认权限 |
| P6-A | replay/eval | 不执行真实高风险工具 |
| P6-B | LearningProposal、批准、回滚 | 不静默改规则 |
| P7-A | 小白首页、首次启动、确认页面 | 不暴露 Agent 术语 |

## 当前验证结果与证据等级

### 自动测试/构建

已运行：

- `org-engine/editor`: backend 75 tests、frontend 11 tests 全通过。
- `org-engine/editor`: backend/frontend/Electron build 全通过；frontend 有 chunk size warning。
- `org-engine`: Python learning/integration tests 37 passed。
- `org-engine-editor`: backend 40 tests、frontend 6 tests 全通过。
- `lean-hooks`: 16 tests passed。
- 根 `orchestrator`: 默认目录运行因包路径失败；设置 `PYTHONPATH=D:/claude-ecosystem` 后 37 tests passed。

这些结果只能证明单元/集成组件和编译通过，不能证明真实模型、Octop、MCP stdio、Electron 打包和小白任务闭环通过。

另外，`org-engine-editor` 的测试通过不能改变它是重复主线的事实；它的 40 个 backend 测试和 6 个 frontend 测试与 `org-engine/editor` 的 75/11 测试覆盖面不同，不能用其中一套结果代表另一套代码。

### 人工验收已知结果

`org-engine/manual-qa/2026-10-01/final-summary.md` 记录：

- 浏览器主要路径 14 项中 12 通过、2 失败。
- 辅助 E2E 30 项通过，但不等于真实个人助理闭环。
- MCP 只读工具通过，运行启动/取消仍受 runtime 阻塞。
- Electron 构建通过，打包启动在该环境有 Crashpad 阻塞。
- Bridge 安装成功但复制零个 harness 文件，属于“成功提示不真实”。

这些问题在 P0 前不能被新功能覆盖。

## 个人助理的人工验收矩阵

### MUA-01 首次启动

1. 不读代码，只按 UI 选择本地模型和工作区。
2. 确认默认只读。
3. 确认首页是“我要办一件事”。
4. 首次五分钟内完成一个本地样例预演。

### MUA-02 资料整理

1. 放入十份测试材料。
2. 输入“帮我整理这些材料，列出我需要处理的事情，并生成一份汇总表”。
3. 检查每条事实都有来源。
4. 检查歧义变成待确认。
5. 检查模拟不污染真实目录。
6. 打开生成的汇总表，确认原文件未被修改，完成卡包含真实 evidence。

### MUA-03 天气提醒

1. 开启天气来源并选择一个地点。
2. 输入“明早提醒我根据天气准备出门”。
3. 检查显示天气来源、更新时间和使用的个人偏好。
4. 模拟低温、降雨、过期数据和断网，确认不会编造天气或静默联网替代。
5. 确认提醒可以关闭、修改和查看依据。

### MUA-04 旅行规划与权限边界

1. 输入“帮我订一个下周去上海的酒店”，但不提供日期、预算和入住人。
2. 确认系统先询问缺失信息，而不是自行猜测。
3. 检查酒店候选显示价格、房型、取消政策、来源和查询时间。
4. 确认没有独立确认前不会下单或付款。
5. 修改日期、房型或价格后旧 token 必须失效。
6. 取消任务并检查没有订单创建或付款记录。

### MUA-05 学习

1. 连续三次修改同类草稿格式。
2. 检查系统提出提案而不是静默记忆。
3. 查看案例、反例和影响范围。
4. 批准、运行回归、回滚并重新执行。

### MUA-06 失败恢复

1. 停止本地模型。
2. 提交新任务。
3. 检查明确显示模型不可用且没有云端请求。
4. 恢复模型后重试，不能重复执行已完成动作。

### MUA-07 重启和导出

1. 重启 backend、Electron 和系统。
2. 重新打开事项、trace 和证据。
3. 导出个人代理包。
4. 在副本数据目录导入，确认事实、规则、案例和版本恢复。

## Alpha 门槛

以下任一项不达标，都不能称为可用 Alpha：

- 未授权高风险动作：0
- 无证据事实升级：0
- 模拟污染真实工作区：0
- 无验证证据却显示完成：0
- 本地模型不可用时静默联网：0
- “绝不自动发送”回归集：100%
- 首次任务完成率：至少 80%
- 用户能解释下一步、依据和风险：至少 80%
- 个人状态可查看、导出、删除、回滚
- 三个代表性场景共用同一事务状态、确认和验证语义，后续能力按同一规范接入
- “改成周五”“便宜一点”等补充能更新正确事项；指代不明时询问，修改后旧确认失效
- 测试日程能力可通过统一入口使用；停用或请求未支持能力时不会假装完成
- 跨能力组合事项逐步验证，部分完成与整体完成明确区分

## Kill criteria

出现以下情况立即停止扩展功能，回到 P0-P3：

- 仍有任何未授权高风险动作。
- UI、导出、安装或完成状态对用户撒谎。
- Laya 被用作自由聊天或唯一事实来源。
- 中文任务默认使用英文根模型且没有显式警告。
- 没有本地模型时静默请求云端。
- 多 Agent 只是增加成本，没有独立证据或可验证收益。
- Org Engine 和 `org-engine-editor` 继续双主线开发。
- 新功能开始复制 Octop 的 Connector、浏览器、IM、Memory 或模型运行时。
- 个人数据服务默认无认证地监听非 loopback 地址，或 Laya endpoint 无认证地对外监听。
- MCP 能启动任务但不能提交 gateway 决策、读取 receipt 或完成状态闭环。
- UI 保存的角色/技能与实际 runtime 绑定不一致。
- 为了展示“贾维斯”而把文件、天气和旅行做成没有共同事务内核的功能孤岛。

## 最终建议

建议继续做，但把项目从“多 Agent 组织编辑器”转成三件事的组合：

1. Octop：本地 Agent 执行底座。
2. Org Engine：个人目标、规则、证据、确认、验证和回放层。
3. Laya：JEV-compatible 的有限决策评分器，中文优先使用 multilingual checkpoint。

真正的差异化不是“有更多 Agent”，而是：

> 这个系统不会因为模型说“完成了”就相信它；它必须给出依据、授权和可验证的完成证据，并且可以回放、导出、撤销和回滚。

这条路线复用了现有资产，也避开了与 Octop 的正面重复竞争。产品目标是覆盖日常个人事务的本地助理；资料/表格、天气和旅行用来验证通用内核。实际预订与付款必须在证据、确认和验证成熟后再开放。P0 通过前集中恢复现有运行基线；架构从开始就明确后续能力包的接入方式，随后按用户需求逐步扩展，并支持跨能力组合事务。
