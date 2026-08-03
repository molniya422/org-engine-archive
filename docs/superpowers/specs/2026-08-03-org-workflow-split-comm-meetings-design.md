# Org Engine Editor — 组织/Workflow 拆分 + 智能体通信控制 + 会议功能 设计

> **日期**：2026-08-03
> **状态**：已确认（brainstorming 产出，用户批准）
> **方案**：方案 B（协议扩展，引擎同步演进）
> **参考**：`2026-07-25-hierarchical-multi-agent-org-design.md`（引擎分层规范）、`2026-07-29-workflow-editor-design.md`（工作流编辑器设计）

---

## 0. 一句话概览

把 org-engine-editor 的两大功能彻底拆分并强关联：**组织（org）＝角色构建**（谁是谁、身份/权限/技能），**Workflow＝结构搭建**（流程怎么走、谁和谁通信、何时开会）。workflow 新增**智能体通信控制**（点对点消息边 + 共享频道 ACL，默认组织树隔离），并在此基础上新增**会议功能**（部门内/部长级/决策三类，显式会议节点）。通过 JSON-RPC 协议扩展（`workflow_path` + 新事件）让引擎（lean-hooks/harness）原生执行新结构。另纳入四项延伸能力：**会议时间线/纪要视图、通信审计日志视图、产物密钥注册表、强绑定校验面板**。

**核心价值**：角色与结构解耦（org 改了 workflow 自动生效）、通信隔离显式可配置（而非硬编码组织树）、会议成为可设计的一等结构（而非固定引擎阶段）、治理过程全程可视。

---

## 1. 现状诊断（拆分的依据）

| 位置 | 现状 | 问题 |
|---|---|---|
| org 配置 | `departments[].manager_pipeline`（decompose/dispatch/collect/review） | 定义了执行**结构**，属 workflow 职责 |
| org 配置 | `org.contracts`（契约 owner/version/dependents） | 承担跨部门协作**结构**，属 workflow/内核职责 |
| workflow 画布 | `agent` 节点同时承载角色身份与执行结构；`orgRef` 仅 `deptIdx/roleIdx` 数字索引 | 弱绑定，改 org 后绑定漂移 |
| playbook | `applyPlaybook` 有 `create_org/apply_to_org/workflow_only` 三模式 | 说明两者边界本就模糊 |
| 引擎（lean-hooks/harness） | 2026-07-25 分层规范已规定「内核=通信中转+边界强制+会议主持+递归+预算+契约；Workflow=单层执行体」 | 编辑器数据模型**未对齐**此分工——重叠的根源 |

引擎已有基础原语：`ChannelHandle` + `_mediation_decision`（组织树硬隔离）、`run_meeting`（跨部门主管多轮合议）、`ContractStore`、`issue_product_key`、问责链、三关口。但通信隔离**不可配置**、会议**只有一种类型**、与 workflow 结构**脱钩**。

---

## 2. 数据模型

### 2.1 组织配置 v2.0 —— 纯角色注册表

`schema/org-config.schema.json` 升到 `v2.0`，只描述「谁」。

```yaml
version: "2.0"
org:
  name: default-org
  description: "..."
  departments:
    - name: Arch
      description: "跨部门技术决策"
      required: true
      roles:
        - id: arch.architect        # 新增：全局稳定 ID ← workflow 强绑定锚点
          name: architect
          agent_type: general-purpose
          bound_skills: [design-patterns]   # 原单值 bound_skill 扩为复数
          persona:                          # 新增：身份/人设
            title: 首席架构师
            backstory: "..."
            output_format: verdict           # 原 verdict_format
          permissions:
            can_veto: true
            can_escalate: true
  budget: { max_depth: 3, max_cycles_per_layer: 3, max_executors_per_department: 6, max_parallel_agents: 8, gateway_timeout_minutes: 60 }
```

**变更要点**：
- **移除** `departments[].manager_pipeline`、`org.contracts`（移交 workflow）
- 部门降级为纯分组（name/description/required/roles）
- `id` 用 `dept.role` 命名保证全局唯一；workflow 以此为强引用锚
- `bound_skills` 复数；`verdict_format` → `persona.output_format`；`can_veto/can_escalate` → `permissions` 对象

### 2.2 工作流配置 v2.0 —— 纯执行结构

新建 `schema/workflow-config.schema.json` **v2.0**，描述「怎么走 + 谁跟谁通 + 何时开会」。

```yaml
version: "2.0"
name: my-flow
triggers: [manual]
nodes:
  - id: n1
    type: agent
    role_ref: arch.architect          # 强引用 org 角色 ID（运行时解析身份）
    override: { goal: "本次任务具体目标" }  # 允许覆写执行期字段
  - id: n2
    type: channel                     # 新增：共享通信频道
    channel: { key: api-design, acl: { read: [fe.*, be.*], write: [arch.architect] } }
  - id: n3
    type: meeting                     # 新增：会议
    meeting:
      type: ministerial               # dept_internal | ministerial | decision
      participants:
        from: managers                # 来源枚举：department | managers | exec_roles | explicit
        department: Arch              # from=department 时指定部门；from=exec_roles 时可选 roles 列表
        roles: []                     # from=explicit 时填角色 ID 列表
      channel: api-design
      agenda: "敲定 API 契约"
      output: { write_to: [channel, flow] }
edges:
  - { id: e1, source: n1, target: n2, kind: flow }      # 执行序列
  - { id: e2, source: n1, target: n3, kind: message }   # 点对点通信授权
```

**节点类型**：`agent(role_ref)` / `skill` / `decision` / `parallel` / `channel` / `meeting`
**边类型**：`flow`（执行序列）| `message`（点对点通信授权）
**强绑定**：`agent.role_ref` → org 角色 ID；editor 用下拉选择器保证有效引用
**`meeting.type`**：
- `dept_internal`：参与者=单部门角色，主持人=部门主管，产出=部门共识
- `ministerial`：参与者=部门主管，产出=跨部门对齐/契约敲定（复用现有 `run_meeting`）
- `decision`：参与者=执行层角色 + `can_veto` 否决权角色，产出=绑定决议

---

## 3. 引擎运行时模型（lean-hooks/harness 扩展）

### 3.1 通信：显式规则优先，默认隔离回落

- 保留现有 `_mediation_decision` 组织树隔离为**默认基线**：同部门兄弟 ALLOW、向父主管 ALLOW、跨部门 executor REJECT、绕过主管找别部门管理 REJECT、未知 REJECT
- `mediate()` 执行顺序：
  1. 查 workflow 显式 `message` 边：命中 → 按边的授权裁决（可**放宽**跨部门点对点，也可**收紧**为必须显式授权）
  2. 查 `channel` 节点 ACL：读写白名单角色 ID
  3. 未命中 → 回落默认组织树隔离
- 每条消息记审计日志：`{sender, recipient, channel?, verdict: allow|reject, reason, ts}`

### 3.2 会议：`run_meeting` 支持 `meeting_type`

- `ministerial` → 现有 `run_meeting` 行为（多轮合议、accept/revise/escalate、轮次硬上限 3、超限升级关口2）
- `dept_internal` → 新增原语：参与者=单部门角色，主持人=部门主管，产出=部门共识（写回频道）
- `decision` → 执行层角色 + `can_veto` 角色；产出=**绑定决议**，写入 `channel`（持久可见）或 `ratify` 契约提案
- 沿用：多轮合议 + 轮次硬上限 + 升级用户仲裁（关口2）；会议自动归档（ecosystem bridge → loop states + auto-summary + memory）

### 3.3 协议扩展（`orchestrator_adapter`）

```jsonc
// StartRunRequest 扩展
{ "method": "start_run",
  "params": {
    "org_config_path": "...",
    "task_description": "...",
    "output_dir": "...",
    "workflow_path": "..."            // 新增：可选，提供结构/通信/会议
    // meeting_config 由 workflow_path 内联提供
  } }

// 新增事件（前端订阅）
{ "type": "meeting_started",  "meeting": {type, dept, participants}, ... }
{ "type": "meeting_cycle",    "meeting": {type, cycle, verdicts, decision}, ... }
{ "type": "message_mediated", "message": {sender, recipient, channel, verdict, reason}, ... }
{ "type": "decision_recorded","decision": {meeting, output, target}, ... }
```

---

## 4. 编辑器 UI 变更（org-engine-editor/frontend）

### 4.1 新增 4 个视图

| 视图 | 内容 | 数据源 |
|---|---|---|
| **MeetingsView** 会议记录 | 全部会议时间线：类型徽标、参与者、轮次、决议、链接的契约与 workflow 节点 | `meeting_started/meeting_cycle/decision_recorded` 事件 + 引擎归档 |
| **CommAuditView** 通信审计 | 每条被中介消息：发送者→接收者、频道、allow/reject、时间 | `message_mediated` 事件 |
| **ProductRegistryView** 产物注册表 | 每个角色产物密钥 + 审计门状态（已发/阻塞）、skill manifest 合规 | `product_key_issued` + 引擎状态 |
| **强绑定校验**（集成进 org 编辑器 + workflow 画布） | 编辑 org 角色时显示哪些 workflow 引用它；断引用实时告警 | 共享 `binding-resolver` 工具 |

### 4.2 workflow 画布扩展

- 新节点：`ChannelNode`、`MeetingNode`（配置 type/参与者/议程/channel/输出）
- 边新增 `kind` 切换（`flow`/`message`）；message 边有视觉区分（虚线/箭头样式）
- AgentNode 属性面板的「角色」字段改为 **roleRef 下拉选择器**（从 org 拉取，保证强绑定）

### 4.3 org 编辑器瘦身

- Studio/RoleEditor 只保留角色定义（id、persona、skills、permissions）
- 删除 manager_pipeline / contracts 相关 UI

### 4.4 RunMonitor 扩展

- 订阅并展示 `meeting_started/meeting_cycle/message_mediated/decision_recorded` 事件

---

## 5. 后端变更（backend-server）

- `org-config`：schema v2.0 + validator（角色 ID 唯一性、跨引用检查）
- 新增 `workflow-config`：schema + validator + store + routes（CRUD）
- 新增 `binding-resolver`：roleRef→角色解析、override 合并、断引用检测（供强绑定校验面板 + 运行时投影）
- `run-manager` / `orchestrator-adapter`：`start_run` 携带 `workflow_path`；新事件透传
- 新增查询端点：meetings / comm audit / product registry（从引擎状态读）

---

## 6. 迁移（org v1 → v2）

- 自动分配角色 ID（`dept.role`）
- `manager_pipeline` 各阶段 → workflow agent 节点（带对应 skill）
- `contracts` → workflow channel + 相关节点
- 引擎侧 `org_config_loader` 兼容 v1 和 v2
- `examples/default-org.yaml` 更新为 v2 范例

---

## 7. 测试策略

1. **Schema 校验**：org v2 / workflow v2（角色 ID 唯一性、ACL 引用存在性、role_ref 可解析）
2. **绑定解析器**：roleRef→角色解析、override 合并、断引用检测
3. **中介逻辑**（引擎单测）：p2p 边、channel ACL、默认隔离回落、审计日志
4. **会议**（引擎单测）：三种类型参与者推导、产出决议写回、轮次上限升级
5. **协议/适配器**：`workflow_path`、四个新事件
6. **前端**：channel/meeting 节点渲染、roleRef 选择器、四个新视图；Playwright e2e

---

## 8. 实现顺序（给 writing-plans 用）

- **P0**：schema v2.0（org + workflow）+ validator + 绑定解析器 + 迁移脚本
- **P1**：后端 workflow store/routes + 协议扩展（`workflow_path` + 新事件）+ 查询端点
- **P2**：引擎（harness）——workflow loader、`mediate()` 显式规则、`run_meeting(meeting_type)`、部门内会议原语、审计日志
- **P3**：前端 org 瘦身 + workflow 画布（channel/meeting 节点、message 边、roleRef 选择器）
- **P4**：前端四个新视图 + RunMonitor 扩展
- **P5**：端到端测试（schema→editor→run→events→视图）

---

## 9. 未决项

- `dept_internal` 会议的参与者自动推导规则（单部门全部角色 vs 指定角色）：以「显式列表优先、缺省用部门全角色」为默认
- 通信审计日志的保留窗口（内存 vs 落盘）：默认落盘到引擎状态目录，可配置
- `channel` 是否与 `ContractStore` 统一：初版独立（channel=消息频道，contract=对齐接口），后续可融合
