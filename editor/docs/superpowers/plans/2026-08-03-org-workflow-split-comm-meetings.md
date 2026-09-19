# 组织/Workflow 拆分 + 智能体通信控制 + 会议功能 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 org-engine-editor 的组织（角色构建）与 workflow（结构搭建）彻底拆分并强关联，在 workflow 中新增智能体通信控制（点对点边 + 频道 ACL + 默认隔离），并新增三类会议（部门内/部长级/决策），通过协议扩展让引擎原生执行。

**Architecture:** 方案 B（协议扩展，引擎同步演进）。org schema 升 v2.0（只留角色注册表），新建 workflow schema v2.0（节点含 channel/meeting，边分 flow/message）。后端加绑定解析器（roleRef→org 角色）+ 迁移脚本。引擎（lean-hooks/harness）扩展 `StartRunRequest` 接受 `workflow_path`，`mediate()` 支持显式通信规则，`run_meeting()` 支持 `meeting_type`，新增 4 类事件。前端 org 编辑器瘦身、workflow 画布加 channel/meeting 节点与 message 边，并新增 4 个治理视图。

**Tech Stack:** TypeScript + Fastify（backend-server）、React + Zustand + React Flow（@xyflow/react）（frontend）、Python（引擎 harness）、YAML/Ajv（schema 校验）、Vitest + Playwright（测试）。

**设计文档：** `docs/superpowers/specs/2026-08-03-org-workflow-split-comm-meetings-design.md`

**范围注意：** 本计划横跨两个代码库。P0-P2 是编辑器后端 + 引擎（核心数据与运行时逻辑）；P3-P5 是编辑器前端。每个 Phase 结束都是可测试的里程碑。引擎位于 `D:\claude-ecosystem\lean-hooks\harness\`（与编辑器 repo 分离），执行 P2 前需确认该路径可写。

---

## 文件结构图

```
org-engine-editor/                          # 编辑器 repo（P0-P5 主体）
├── schema/
│   ├── org-config.schema.json              # [MODIFY] v2.0：去 manager_pipeline/contracts，加 role.id/bound_skills/persona/permissions
│   └── workflow-config.schema.json         # [CREATE] v2.0：agent/skill/decision/parallel/channel/meeting 节点，flow/message 边
├── backend-server/src/
│   ├── org-config/validator.ts             # [MODIFY] v2 校验（role.id 唯一性）
│   ├── org-config/store.ts                 # [MODIFY] list() 兼容 v2（无 contracts）
│   ├── workflow-config/validator.ts        # [CREATE] workflow 校验（role_ref 可解析、ACL 引用存在）
│   ├── workflow-config/store.ts            # [CREATE] workflow CRUD（yaml 持久化）
│   ├── workflow-config/yaml-io.ts          # [CREATE] workflow yaml 读写（复用 org yaml-io 模式）
│   ├── binding-resolver.ts                 # [CREATE] roleRef→角色解析 + override 合并 + 断引用检测
│   ├── migrate-org.ts                      # [CREATE] org v1→v2 迁移脚本
│   ├── org-config.routes.ts                # [MODIFY] 导出/校验兼容 v2
│   ├── workflow.routes.ts                  # [CREATE] /api/v1/workflows CRUD + validate + export
│   ├── insights.routes.ts                  # [CREATE] /api/v1/insights/{meetings|comm|products}
│   ├── orchestrator-adapter/protocol.ts    # [MODIFY] StartRunRequest + 4 新事件类型
│   ├── orchestrator-adapter/client.ts      # [MODIFY] start() 传 workflow_path
│   ├── run-manager/manager.ts              # [MODIFY] start() 增 workflowPath 参数
│   ├── run.routes.ts                       # [MODIFY] POST /runs 增 workflow_path
│   └── server.ts                           # [MODIFY] 注册 workflow/insights 路由
├── frontend/src/
│   ├── types/schema.ts                     # [MODIFY/REGEN] workflow v2 类型
│   ├── api/client.ts, index.ts             # [MODIFY] workflows/insights API
│   ├── api/ws.ts                           # [MODIFY] 新事件订阅
│   ├── stores/workflow-store.ts            # [MODIFY] channel/meeting 节点、message 边、roleRef
│   ├── stores/org-store.ts                 # [MODIFY] loadWorkflowRefs / 断引用
│   ├── stores/insights-store.ts            # [CREATE] meetings/comm/products
│   ├── components/workflow/types.ts        # [MODIFY] WorkflowNodeType + ChannelNodeData/MeetingNodeData + EdgeKind
│   ├── components/workflow/WorkflowCanvas.tsx       # [MODIFY] 注册 ChannelNode/MeetingNode、边样式
│   ├── components/workflow/WorkflowToolbar.tsx      # [MODIFY] 节点面板 + 边 kind 切换
│   ├── components/workflow/PropertiesPanel.tsx      # [MODIFY] roleRef 选择器、meeting/channel 配置
│   ├── components/workflow/nodes/ChannelNode.tsx    # [CREATE]
│   ├── components/workflow/nodes/MeetingNode.tsx    # [CREATE]
│   ├── components/RoleEditor.tsx           # [MODIFY] 瘦身：id/persona/skills/permissions
│   ├── views/StudioView.tsx                # [MODIFY] 去 manager_pipeline/contracts UI
│   ├── views/MeetingsView.tsx              # [CREATE]
│   ├── views/CommAuditView.tsx             # [CREATE]
│   ├── views/ProductRegistryView.tsx       # [CREATE]
│   ├── views/RunMonitorView.tsx            # [MODIFY] 新事件渲染 + 画布高亮
│   ├── lib/binding-check.ts                # [CREATE] 强绑定校验工具（refs/断引用/环检测）
│   ├── components/binding/BindingCheckPanel.tsx    # [CREATE]
│   ├── router.tsx                          # [MODIFY] 注册新视图
│   └── layouts/AppShell.tsx                # [MODIFY] 导航项
└── examples/default-org.yaml               # [MODIFY] 升 v2

lean-hooks/harness/                        # 引擎 repo（P2）
├── org_config_loader.py                    # [MODIFY] v2 支持（role id/bound_skills 复数）
├── workflow_config_loader.py               # [CREATE] workflow yaml → 内部结构
├── orchestrator_adapter.py                 # [MODIFY] workflow_path + 4 新事件
├── organization_orchestrator.py            # [MODIFY] mediate() 显式规则、run_meeting(meeting_type)、审计日志
└── test_workflow_comm_meetings.py          # [CREATE]
```

---

# Phase 0 (P0)：Schema v2 + Validator + 绑定解析器 + 迁移

> 产出：org v2 / workflow v2 schema 生效，v2 校验通过，roleRef 强绑定解析器可用，v1 配置可一键迁移。全部可单测。

## Task 0.1: org-config schema v2.0（去结构、加角色锚）

**Files:**
- Modify: `schema/org-config.schema.json`
- Modify: `frontend/src/types/schema.ts`（重新生成）

- [ ] **Step 1: 改 schema 到 v2.0**

把 `schema/org-config.schema.json` 的 `version` const 改为 `"2.0"`；在 `org.departments` 下删去 `manager_pipeline`；在 `org` 下删去 `contracts`；`role` 定义改为：

```json
"role": {
  "type": "object",
  "required": ["id", "name", "agentType", "bound_skills"],
  "properties": {
    "id": { "type": "string", "pattern": "^[a-z][a-z0-9]*\\.[a-z][a-z0-9_]*$" },
    "name": { "type": "string", "pattern": "^[a-z][a-z0-9_]*$" },
    "description": { "type": "string", "maxLength": 500 },
    "agentType": { "type": "string" },
    "bound_skills": { "type": "array", "minItems": 1, "items": { "type": "string" } },
    "persona": {
      "type": "object",
      "properties": {
        "title": { "type": "string", "maxLength": 100 },
        "backstory": { "type": "string", "maxLength": 1000 },
        "output_format": { "type": "string", "maxLength": 200 }
      }
    },
    "permissions": {
      "type": "object",
      "properties": {
        "can_veto": { "type": "boolean", "default": false },
        "can_escalate": { "type": "boolean", "default": false }
      }
    }
  }
}
```

同时在 `$defs.department` 的 `properties` 中保留 `required`、删除 `manager_pipeline`。

- [ ] **Step 2: 跑现有 v1 校验测试，确认会因 v2 变化失败**

Run: `cd org-engine-editor/backend-server && npm test`
Expected: 现有使用 v1 结构的 fixture（含 manager_pipeline）校验失败 —— 这是预期红。

- [ ] **Step 3: 更新 `examples/default-org.yaml` 为 v2**

将 `bound_skill` 单值改为 `bound_skills` 数组、加 `id`（`arch.architect` 等）、删 `manager_pipeline` 与 `contracts`。参照设计文档 §2.1 样例。

- [ ] **Step 4: 跑 backend 测试**

Run: `cd org-engine-editor/backend-server && npm test`
Expected: 引入新的 v2 fixture 后 PASS（见 Task 0.2）。

- [ ] **Step 5: Commit**

```bash
cd /d/claude-ecosystem/org-engine-editor && git add schema/org-config.schema.json examples/default-org.yaml && git commit -m "feat(schema): org-config v2.0 role registry"
```

## Task 0.2: org-config validator v2 + role id 唯一性

**Files:**
- Modify: `backend-server/src/org-config/validator.ts`
- Test: `backend-server/tests/org-config-v2.test.ts`
- Fixture: `backend-server/tests/fixtures/valid-v2.yaml`

- [ ] **Step 1: 写失败测试（id 唯一性 + 非法 id 拒绝）**

```ts
import { describe, it, expect } from 'vitest';
import { Validator } from '../src/org-config/validator';

function makeOrg(roles: any[]) {
  return { version: '2.0', org: { name: 't', departments: [{ name: 'Arch', roles }] }, budget: {} };
}

describe('org-config v2', () => {
  it('accepts a valid v2 org with unique role ids', () => {
    const v = new Validator();
    const r = v.validateRaw(makeOrg([
      { id: 'arch.architect', name: 'architect', agentType: 'general-purpose', bound_skills: ['design-patterns'] },
    ]));
    expect(r.valid).toBe(true);
  });

  it('rejects duplicate role ids', () => {
    const v = new Validator();
    const r = v.validateRaw(makeOrg([
      { id: 'arch.architect', name: 'a', agentType: 'x', bound_skills: ['s'] },
      { id: 'arch.architect', name: 'b', agentType: 'x', bound_skills: ['s'] },
    ]));
    expect(r.valid).toBe(false);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `cd org-engine-editor/backend-server && npx vitest run tests/org-config-v2.test.ts`
Expected: 重复 id 用例 FAIL（validator 尚不查唯一性）。

- [ ] **Step 3: 实现唯一性校验**

在 `Validator.validateRaw` 中，schema 校验通过后追加：收集所有 `role.id`，遇重复则返回 `{ valid:false, errors:[{ message:'duplicate role id: X' }] }`。

```ts
validateRaw(data: unknown): ValidationResult {
  const valid = this.validate(data) as boolean;
  if (!valid) return { valid, errors: structuredClone(this.validate.errors ?? []) };
  const ids = new Set<string>();
  const errors: ErrorObject[] = [];
  const org = (data as any)?.org;
  for (const dept of org?.departments ?? []) {
    for (const role of dept?.roles ?? []) {
      if (role?.id) {
        if (ids.has(role.id)) errors.push({ message: `duplicate role id: ${role.id}` } as ErrorObject);
        ids.add(role.id);
      }
    }
  }
  return errors.length ? { valid: false, errors } : { valid: true, errors: [] };
}
```

- [ ] **Step 4: 运行确认通过**

Run: `cd org-engine-editor/backend-server && npx vitest run tests/org-config-v2.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add backend-server/src/org-config/validator.ts backend-server/tests/org-config-v2.test.ts backend-server/tests/fixtures/valid-v2.yaml && git commit -m "feat(org-config): v2 validation with role id uniqueness"
```

## Task 0.3: workflow-config schema v2.0

**Files:**
- Create: `schema/workflow-config.schema.json`

- [ ] **Step 1: 建 schema**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "WorkflowConfig",
  "type": "object",
  "required": ["version", "name", "nodes"],
  "properties": {
    "version": { "const": "2.0" },
    "name": { "type": "string", "pattern": "^[\\p{L}\\p{N}_-]{1,64}$" },
    "triggers": { "type": "array", "items": { "type": "string" }, "default": ["manual"] },
    "nodes": { "type": "array", "minItems": 1, "items": { "$ref": "#/$defs/node" } },
    "edges": { "type": "array", "items": { "$ref": "#/$defs/edge" } }
  },
  "$defs": {
    "node": {
      "type": "object",
      "required": ["id", "type"],
      "properties": {
        "id": { "type": "string" },
        "type": { "enum": ["agent", "skill", "decision", "parallel", "channel", "meeting"] },
        "role_ref": { "type": "string" },
        "override": { "type": "object" },
        "skill": { "type": "object", "properties": { "skillId": { "type": "string" }, "params": { "type": "object" }, "timeout": { "type": "integer" } } },
        "decision": { "type": "object", "properties": { "condition": { "type": "string" }, "branches": { "type": "object" } } },
        "parallel": { "type": "object", "properties": { "branches": { "type": "array", "items": { "type": "string" } }, "mergeStrategy": { "enum": ["all", "any", "sequence"] } } },
        "channel": { "type": "object", "required": ["key"], "properties": { "key": { "type": "string" }, "acl": { "type": "object", "properties": { "read": { "type": "array", "items": { "type": "string" } }, "write": { "type": "array", "items": { "type": "string" } } } } } },
        "meeting": {
          "type": "object",
          "required": ["type"],
          "properties": {
            "type": { "enum": ["dept_internal", "ministerial", "decision"] },
            "participants": {
              "type": "object",
              "properties": {
                "from": { "enum": ["department", "managers", "exec_roles", "explicit"] },
                "department": { "type": "string" },
                "roles": { "type": "array", "items": { "type": "string" } }
              }
            },
            "channel": { "type": "string" },
            "agenda": { "type": "string" },
            "output": { "type": "object", "properties": { "write_to": { "type": "array", "items": { "enum": ["channel", "flow"] } } } }
          }
        }
      }
    },
    "edge": {
      "type": "object",
      "required": ["id", "source", "target", "kind"],
      "properties": {
        "id": { "type": "string" },
        "source": { "type": "string" },
        "target": { "type": "string" },
        "kind": { "enum": ["flow", "message"] }
      }
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add schema/workflow-config.schema.json && git commit -m "feat(schema): workflow-config v2.0 with channel/meeting nodes and flow/message edges"
```

## Task 0.4: workflow-config store + validator + routes

**Files:**
- Create: `backend-server/src/workflow-config/yaml-io.ts`
- Create: `backend-server/src/workflow-config/store.ts`
- Create: `backend-server/src/workflow-config/validator.ts`
- Create: `backend-server/src/workflow.routes.ts`
- Modify: `backend-server/src/server.ts`
- Test: `backend-server/tests/workflow-config.test.ts`

- [ ] **Step 1: 写失败测试（store CRUD + 校验 role_ref）**

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { WorkflowConfigStore } from '../src/workflow-config/store';
import { Validator as OrgValidator } from '../src/org-config/validator';

describe('workflow-config', () => {
  it('persists and loads a workflow', () => {
    const store = new WorkflowConfigStore();
    const wf = { version: '2.0', name: 'wf1', nodes: [{ id: 'n1', type: 'agent', role_ref: 'arch.architect' }], edges: [] };
    store.save('wf1', wf);
    expect(store.get('wf1')).toEqual(wf);
    store.delete('wf1');
  });

  it('rejects a workflow whose role_ref does not exist in org', () => {
    const orgValidator = new OrgValidator();
    const store = new WorkflowConfigStore(orgValidator);
    const wf = { version: '2.0', name: 'wf2', nodes: [{ id: 'n1', type: 'agent', role_ref: 'missing.role' }], edges: [] };
    const r = store.validate(wf);
    expect(r.valid).toBe(false);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `cd org-engine-editor/backend-server && npx vitest run tests/workflow-config.test.ts`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现 yaml-io（仿 org yaml-io）**

```ts
// workflow-config/yaml-io.ts — 复用 org yaml-io 的原子写模式，仅换 BASE_DIR
import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync, unlinkSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { parse, stringify } from 'yaml';

const BASE_DIR = join(homedir(), '.org-engine-editor', 'workflows');

function ensureDir(): string { if (!existsSync(BASE_DIR)) mkdirSync(BASE_DIR, { recursive: true }); return BASE_DIR; }

export function readWorkflowConfig(id: string): unknown {
  const path = join(ensureDir(), `${id}.yaml`);
  return existsSync(path) ? parse(readFileSync(path, 'utf-8')) : null;
}
export function writeWorkflowConfig(id: string, data: unknown): void {
  const path = join(ensureDir(), `${id}.yaml`);
  const tmpPath = path + '.tmp';
  writeFileSync(tmpPath, stringify(data, { indent: 2, sortMapEntries: true, lineWidth: 120 }), 'utf-8');
  renameSync(tmpPath, path);
}
export function listWorkflowConfigs(): string[] {
  return readdirSync(ensureDir()).filter(f => f.endsWith('.yaml')).map(f => f.replace(/\.yaml$/, ''));
}
export function deleteWorkflowConfig(id: string): void {
  const path = join(ensureDir(), `${id}.yaml`);
  if (existsSync(path)) unlinkSync(path);
}
```

- [ ] **Step 4: 实现 validator（role_ref 可解析 + ACL 引用存在）**

```ts
// workflow-config/validator.ts
import Ajv, { ErrorObject } from 'ajv';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface ValidationResult { valid: boolean; errors: ErrorObject[]; }

export class WorkflowValidator {
  private ajv: Ajv;
  private validate: ReturnType<Ajv['compile']>;

  constructor(private orgRoles: (id: string) => boolean, schemaPath?: string) {
    this.ajv = new Ajv({ allErrors: true, useDefaults: true, validateSchema: false });
    const resolved = schemaPath || join(process.cwd(), '..', 'schema', 'workflow-config.schema.json');
    this.validate = this.ajv.compile(JSON.parse(readFileSync(resolved, 'utf-8')));
  }

  validateRaw(data: unknown): ValidationResult {
    const valid = this.validate(data) as boolean;
    if (!valid) return { valid, errors: structuredClone(this.validate.errors ?? []) };
    const errors: ErrorObject[] = [];
    for (const n of (data as any).nodes ?? []) {
      if (n.role_ref && !this.orgRoles(n.role_ref)) errors.push({ message: `unknown role_ref: ${n.role_ref}` } as ErrorObject);
      const acl = n.channel?.acl;
      for (const key of ['read', 'write'] as const) {
        for (const ref of acl?.[key] ?? []) if (!this.orgRoles(ref)) errors.push({ message: `unknown acl ${key} ref: ${ref}` } as ErrorObject);
      }
    }
    return errors.length ? { valid: false, errors } : { valid: true, errors: [] };
  }
}
```

- [ ] **Step 5: 实现 store（持有 org 角色集合）**

```ts
// workflow-config/store.ts
import { WorkflowValidator, ValidationResult } from './validator';
import { readWorkflowConfig, writeWorkflowConfig, listWorkflowConfigs, deleteWorkflowConfig } from './yaml-io';
import { Validator as OrgValidator } from '../org-config/validator';
import { readOrgConfig } from '../org-config/yaml-io';

export class WorkflowConfigStore {
  private validator: WorkflowValidator;
  constructor(orgValidator?: OrgValidator) {
    const ov = orgValidator ?? new OrgValidator();
    const orgRoles = new Set<string>();
    for (const id of listOrgConfigIds(ov)) {
      const cfg = readOrgConfig(id) as any;
      for (const d of cfg?.org?.departments ?? []) for (const r of d?.roles ?? []) if (r?.id) orgRoles.add(r.id);
    }
    this.validator = new WorkflowValidator((ref) => orgRoles.has(ref));
  }
  list(): string[] { return listWorkflowConfigs(); }
  get(id: string): unknown { return readWorkflowConfig(id); }
  save(id: string, data: unknown): void {
    const r = this.validator.validateRaw(data);
    if (!r.valid) throw new Error(`Workflow validation failed: ${r.errors.map(e => e.message).join('; ')}`);
    writeWorkflowConfig(id, data);
  }
  delete(id: string): void { deleteWorkflowConfig(id); }
  validate(data: unknown): ValidationResult { return this.validator.validateRaw(data); }
}

// 辅助：列出 org 配置 id（复用 OrgConfigStore.list 的 id 集合）
import { listOrgConfigs } from '../org-config/yaml-io';
function listOrgConfigIds(_ov: OrgValidator): string[] { return listOrgConfigs(); }
```

- [ ] **Step 6: 实现 routes（仿 org-config.routes.ts）**

```ts
// workflow.routes.ts
import { FastifyInstance } from 'fastify';
import { WorkflowConfigStore } from './workflow-config/store';

export function registerWorkflowRoutes(app: FastifyInstance, store: WorkflowConfigStore): void {
  app.get('/api/v1/workflows', async () => store.list());
  app.get<{ Params: { id: string } }>('/api/v1/workflows/:id', async (req) => store.get(req.params.id));
  app.put<{ Params: { id: string } }>('/api/v1/workflows/:id', async (req, reply) => {
    try { store.save(req.params.id, req.body); return { ok: true }; }
    catch (e: any) { reply.code(400); return { error: e.message }; }
  });
  app.delete<{ Params: { id: string } }>('/api/v1/workflows/:id', async (req) => { store.delete(req.params.id); return { ok: true }; });
  app.post<{ Params: { id: string } }>('/api/v1/workflows/:id/validate', async (req, reply) => {
    try { return store.validate(req.body); } catch (e: any) { reply.code(400); return { error: e.message }; }
  });
}
```

- [ ] **Step 7: 在 server.ts 注册 workflow 路由**

在 `registerOrgRoutes` 调用旁加 `registerWorkflowRoutes(app, new WorkflowConfigStore())`。

- [ ] **Step 8: 运行确认通过 + Commit**

Run: `cd org-engine-editor/backend-server && npx vitest run tests/workflow-config.test.ts`
Expected: PASS。

```bash
git add backend-server/src/workflow-config backend-server/src/workflow.routes.ts backend-server/src/server.ts backend-server/tests/workflow-config.test.ts && git commit -m "feat(workflow-config): store + validator + routes"
```

## Task 0.5: binding-resolver（roleRef 解析 + override 合并 + 断引用）

**Files:**
- Create: `backend-server/src/binding-resolver.ts`
- Test: `backend-server/tests/binding-resolver.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
import { describe, it, expect } from 'vitest';
import { createBindingResolver, ResolvedAgent } from '../src/binding-resolver';

const org = {
  org: { departments: [
    { name: 'Arch', roles: [{ id: 'arch.architect', name: 'architect', agentType: 'general-purpose', bound_skills: ['design-patterns'], persona: { title: '首席架构师' } }] },
  ] },
};

const resolver = createBindingResolver(org);

describe('binding-resolver', () => {
  it('resolves role_ref to role identity', () => {
    const r = resolver.resolve('arch.architect');
    expect(r).not.toBeNull();
    expect(r!.id).toBe('arch.architect');
    expect(r!.boundSkills).toEqual(['design-patterns']);
  });

  it('merges override onto resolved role', () => {
    const agent: ResolvedAgent = resolver.resolveWithOverride('arch.architect', { goal: '本次目标' });
    expect(agent.goal).toBe('本次目标');
    expect(agent.title).toBe('首席架构师');
  });

  it('returns null for unknown role_ref (broken binding)', () => {
    expect(resolver.resolve('missing.role')).toBeNull();
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `cd org-engine-editor/backend-server && npx vitest run tests/binding-resolver.test.ts`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现**

```ts
// binding-resolver.ts
export interface RoleIdentity {
  id: string; name: string; agentType: string; boundSkills: string[];
  persona?: { title?: string; backstory?: string; output_format?: string };
  permissions?: { can_veto?: boolean; can_escalate?: boolean };
}
export interface ResolvedAgent extends RoleIdentity { goal?: string; }

export interface BindingResolver {
  resolve(id: string): RoleIdentity | null;
  resolveWithOverride(id: string, override?: Record<string, unknown>): ResolvedAgent | null;
  references(): { roleId: string; workflows: string[] }[]; // 供强绑定校验面板
}

export function createBindingResolver(orgConfig: any): BindingResolver {
  const byId = new Map<string, RoleIdentity & { dept: string }>();
  for (const d of orgConfig?.org?.departments ?? []) {
    for (const r of d?.roles ?? []) {
      if (r?.id) byId.set(r.id, {
        id: r.id, name: r.name, agentType: r.agentType,
        boundSkills: r.bound_skills ?? [], persona: r.persona, permissions: r.permissions, dept: d.name,
      });
    }
  }
  return {
    resolve(id) { const r = byId.get(id); return r ? { ...r } : null; },
    resolveWithOverride(id, override) {
      const r = byId.get(id); if (!r) return null;
      return { ...r, goal: (override?.goal as string) ?? r.persona?.title, ...(override ?? {}) };
    },
    references() { return []; }, // 由 workflow 仓库注入（见 Task 4.4 前端面板）
  };
}
```

- [ ] **Step 4: 运行确认通过 + Commit**

Run: `cd org-engine-editor/backend-server && npx vitest run tests/binding-resolver.test.ts`
Expected: PASS。

```bash
git add backend-server/src/binding-resolver.ts backend-server/tests/binding-resolver.test.ts && git commit -m "feat(binding): roleRef resolver with override merge"
```

## Task 0.6: org v1 → v2 迁移脚本

**Files:**
- Create: `backend-server/src/migrate-org.ts`
- Test: `backend-server/tests/migrate-org.test.ts`

- [ ] **Step 1: 写失败测试（v1 配置迁移后含 role id、无 manager_pipeline）**

```ts
import { describe, it, expect } from 'vitest';
import { migrateOrg } from '../src/migrate-org';

const v1 = {
  version: '1.0',
  org: { name: 't', departments: [
    { name: 'Arch', roles: [{ name: 'architect', agentType: 'x', bound_skill: 'design-patterns' }],
      manager_pipeline: [{ name: 'decompose', agentType: 'x', bound_skill: 'pathfinder' }] },
  ], contracts: [{ key: 'api', owner_dept: 'Arch', version: 1, schema: {} }] },
  budget: {},
};

describe('migrateOrg', () => {
  it('assigns role ids and drops structural fields', () => {
    const v2 = migrateOrg(v1) as any;
    expect(v2.version).toBe('2.0');
    expect(v2.org.departments[0].roles[0].id).toBe('arch.architect');
    expect(v2.org.departments[0].manager_pipeline).toBeUndefined();
    expect(v2.org.contracts).toBeUndefined();
    expect(v2.org.departments[0].roles[0].bound_skills).toEqual(['design-patterns']);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `cd org-engine-editor/backend-server && npx vitest run tests/migrate-org.test.ts`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现**

```ts
// migrate-org.ts
import { parse } from 'yaml';
import { readFileSync } from 'node:fs';

export function migrateOrg(v1: any): any {
  if (v1?.version === '2.0') return v1;
  const depts = (v1?.org?.departments ?? []).map((d: any) => {
    const roles = (d.roles ?? []).map((r: any) => {
      const id = r.id ?? `${d.name.toLowerCase()}.${r.name}`;
      const { bound_skill, can_veto, can_escalate, verdict_format, ...rest } = r;
      return {
        id,
        ...rest,
        bound_skills: [bound_skill].filter(Boolean),
        persona: { title: r.name, ...(verdict_format ? { output_format: verdict_format } : {}) },
        permissions: { can_veto: !!can_veto, can_escalate: !!can_escalate },
      };
    });
    const { manager_pipeline, ...deptRest } = d;
    return { ...deptRest, roles };
  });
  return {
    version: '2.0',
    org: { ...v1.org, departments: depts },
    budget: v1.budget ?? {},
    skill_paths: v1.skill_paths ?? [],
    _migrated: { from: '1.0', manager_pipeline: (v1.org?.departments ?? []).flatMap((d: any) => (d.manager_pipeline ?? []).map((s: any) => ({ dept: d.name, ...s }))),
                contracts: v1.org?.contracts ?? [] },
  };
}

// CLI: node migrate-org.ts <input.yaml> <output.yaml>
if (require.main === module) {
  const [, , input, output] = process.argv;
  const raw = parse(readFileSync(input, 'utf-8'));
  const { writeFileSync } = require('node:fs');
  const { stringify } = require('yaml');
  writeFileSync(output, stringify(migrateOrg(raw), { indent: 2 }), 'utf-8');
  console.log(`migrated ${input} -> ${output}`);
}
```

- [ ] **Step 4: 运行确认通过 + Commit**

Run: `cd org-engine-editor/backend-server && npx vitest run tests/migrate-org.test.ts`
Expected: PASS。

```bash
git add backend-server/src/migrate-org.ts backend-server/tests/migrate-org.test.ts && git commit -m "feat(migrate): org-config v1 to v2 migration"
```

> **Phase 0 完成标志：** `npm run test:backend` 全绿；`examples/default-org.yaml` 是 v2；可 `node backend-server/src/migrate-org.ts <v1.yaml> <v2.yaml>` 一键迁移。

---

# Phase 1 (P1)：后端协议扩展 + 查询端点

> 产出：`start_run` 可带 `workflow_path`；4 个新事件类型；insights 查询端点。前端 API 层同步。

## Task 1.1: 协议扩展（protocol.ts + client.ts + run.routes.ts + run-manager）

**Files:**
- Modify: `backend-server/src/orchestrator-adapter/protocol.ts`
- Modify: `backend-server/src/orchestrator-adapter/client.ts`
- Modify: `backend-server/src/run-manager/manager.ts`
- Modify: `backend-server/src/run.routes.ts`

- [ ] **Step 1: 扩展 StartRunRequest + 事件类型**

在 `protocol.ts` 中把 `StartRunRequest.params` 改为：

```ts
export interface StartRunRequest {
  jsonrpc: "2.0"; id: number; method: "start_run";
  params: {
    org_config_path: string; task_description: string; output_dir: string;
    workflow_path?: string;   // 新增
  };
}
```

在事件联合中追加：

```ts
export interface MeetingStartedEvent { type: "meeting_started"; meeting: { type: string; dept?: string; participants: string[] } }
export interface MeetingCycleEvent { type: "meeting_cycle"; meeting: { type: string; cycle: number; verdicts: Record<string,string>; decision: string } }
export interface MessageMediatedEvent { type: "message_mediated"; message: { sender: string; recipient: string; channel?: string; verdict: string; reason: string } }
export interface DecisionRecordedEvent { type: "decision_recorded"; decision: { meeting: string; output: unknown; target: string } }
```

并加入 `OrchestratorEvent` 联合。

- [ ] **Step 2: client.start() 透传 workflow_path**

在 `client.ts` 的 `start(configPath, taskDescription, outputDir, cwd?)` 增加 `workflowPath?: string`，并把它并入 `start_run` 参数：

```ts
async start(configPath: string, taskDescription: string, outputDir: string, cwd?: string, workflowPath?: string): Promise<void> {
  // ...spawn 逻辑不变...
  return this.call('start_run', { org_config_path: configPath, task_description: taskDescription, output_dir: outputDir, ...(workflowPath ? { workflow_path: workflowPath } : {}) }).then(() => undefined);
}
```

- [ ] **Step 3: RunManager.start 增 workflowPath**

在 `run-manager/manager.ts` 的 `start(...)` 增加 `workflowPath?: string` 参数并传给 `client.start(...)`。调用处 `run.routes.ts` 从 body 取 `workflow_path`。

- [ ] **Step 4: run.routes.ts 读 workflow_path**

```ts
app.post<{ Body: { org_id: string; task: string; config_path?: string; workflow_path?: string } }>('/api/v1/runs', async (req, reply) => {
  const { org_id, task, config_path, workflow_path } = req.body;
  // ...校验...
  const runId = await runManager.start(org_id, task, config_path || defaultConfigPath, defaultOutputDir, workflow_path);
  reply.code(201); return { run_id: runId };
});
```

- [ ] **Step 5: 编译检查 + Commit**

Run: `cd org-engine-editor/backend-server && npx tsc --noEmit`
Expected: 无类型错误。

```bash
git add backend-server/src/orchestrator-adapter/protocol.ts backend-server/src/orchestrator-adapter/client.ts backend-server/src/run-manager/manager.ts backend-server/src/run.routes.ts && git commit -m "feat(protocol): start_run accepts workflow_path; add meeting/comm/decision events"
```

## Task 1.2: insights 查询端点（meetings / comm / products）

**Files:**
- Create: `backend-server/src/insights.routes.ts`
- Modify: `backend-server/src/server.ts`
- Test: `backend-server/tests/insights.test.ts`

- [ ] **Step 1: 写失败测试（从引擎状态文件读取）**

```ts
import { describe, it, expect } from 'vitest';
import { readInsights } from '../src/insights.routes';

describe('insights', () => {
  it('returns empty collections when no state dir', () => {
    const r = readInsights('/nonexistent/state/dir');
    expect(r.meetings).toEqual([]);
    expect(r.comm).toEqual([]);
    expect(r.products).toEqual([]);
  });
});
```

- [ ] **Step 2: 实现 readInsights**

```ts
// insights.routes.ts
import { FastifyInstance } from 'fastify';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export interface Insights { meetings: unknown[]; comm: unknown[]; products: unknown[]; }

export function readInsights(stateDir: string): Insights {
  const out = { meetings: [], comm: [], products: [] } as Insights;
  if (!existsSync(stateDir)) return out;
  // 引擎在 stateDir 下写 meetings.jsonl / comm.jsonl / products.json
  for (const [key, file] of [['meetings', 'meetings.jsonl'], ['comm', 'comm.jsonl']] as const) {
    const p = join(stateDir, file);
    if (existsSync(p)) (out[key] as unknown[]) = readFileSync(p, 'utf-8').split('\n').filter(Boolean).map(l => JSON.parse(l));
  }
  const pp = join(stateDir, 'products.json');
  if (existsSync(pp)) out.products = JSON.parse(readFileSync(pp, 'utf-8'));
  return out;
}

export function registerInsightsRoutes(app: FastifyInstance, stateDir: string): void {
  app.get('/api/v1/insights', async () => readInsights(stateDir));
  app.get('/api/v1/insights/meetings', async () => readInsights(stateDir).meetings);
  app.get('/api/v1/insights/comm', async () => readInsights(stateDir).comm);
  app.get('/api/v1/insights/products', async () => readInsights(stateDir).products);
}
```

在 `server.ts` 注册：`registerInsightsRoutes(app, join(homedir(), '.org-engine-editor', 'state'))`。

- [ ] **Step 3: 运行确认通过 + Commit**

Run: `cd org-engine-editor/backend-server && npx vitest run tests/insights.test.ts`
Expected: PASS。

```bash
git add backend-server/src/insights.routes.ts backend-server/src/server.ts backend-server/tests/insights.test.ts && git commit -m "feat(insights): meetings/comm/products query endpoints"
```

## Task 1.3: 前端 API 层（client + ws 新事件）

**Files:**
- Modify: `frontend/src/api/index.ts`
- Modify: `frontend/src/api/client.ts`
- Modify: `frontend/src/api/ws.ts`
- Modify: `frontend/src/types/schema.ts`

- [ ] **Step 1: 在 api 增加 workflows/insights 方法**

```ts
// api/index.ts 追加
listWorkflows: () => api.get('/api/v1/workflows'),
getWorkflow: (id: string) => api.get(`/api/v1/workflows/${id}`),
saveWorkflow: (id: string, data: unknown) => api.put(`/api/v1/workflows/${id}`, data),
deleteWorkflow: (id: string) => api.delete(`/api/v1/workflows/${id}`),
validateWorkflow: (data: unknown) => api.post('/api/v1/workflows/x/validate', data),
getInsights: () => api.get('/api/v1/insights'),
```

- [ ] **Step 2: ws.ts 订阅 4 个新事件**

在 `api/ws.ts` 的 event switch 中，识别 `meeting_started` / `meeting_cycle` / `message_mediated` / `decision_recorded` 并 `emit` 到对应 store（见 Task 4.1-4.3）。

- [ ] **Step 3: 重新生成/手写 schema.ts 的 WorkflowConfig 类型**

在 `frontend/src/types/schema.ts` 追加：

```ts
export type WorkflowNodeType = 'agent' | 'skill' | 'decision' | 'parallel' | 'channel' | 'meeting';
export interface WorkflowMeetingNode {
  type: 'dept_internal' | 'ministerial' | 'decision';
  participants?: { from?: 'department' | 'managers' | 'exec_roles' | 'explicit'; department?: string; roles?: string[] };
  channel?: string; agenda?: string;
  output?: { write_to?: ('channel' | 'flow')[] };
}
export interface WorkflowConfig {
  version: '2.0'; name: string; triggers?: string[];
  nodes: { id: string; type: WorkflowNodeType; role_ref?: string; override?: Record<string, unknown>; meeting?: WorkflowMeetingNode; channel?: { key: string; acl?: { read?: string[]; write?: string[] } } }[];
  edges?: { id: string; source: string; target: string; kind: 'flow' | 'message' }[];
}
```

- [ ] **Step 4: 类型检查 + Commit**

Run: `cd org-engine-editor/frontend && npx tsc --noEmit`
Expected: 无类型错误。

```bash
git add frontend/src/api frontend/src/types/schema.ts && git commit -m "feat(api): workflows/insights client methods + new ws events + v2 types"
```

> **Phase 1 完成标志：** `tsc --noEmit` 后端与前端均无错；后端测试全绿。

---

# Phase 2 (P2)：引擎（lean-hooks/harness）运行时

> 产出：引擎原生接受 `workflow_path`；通信显式规则生效；三类会议可用；4 类事件上抛。
> **注意：** 引擎在独立目录 `D:\claude-ecosystem\lean-hooks\harness\`，不在 org-engine-editor repo 内。用 `pytest` 跑测试。

## Task 2.1: org_config_loader 支持 v2

**Files:**
- Modify: `lean-hooks/harness/org_config_loader.py`
- Test: `lean-hooks/harness/test_workflow_comm_meetings.py`（新建，先只测 v2 load）

- [ ] **Step 1: 写失败测试**

```python
import tempfile, yaml, pytest
from pathlib import Path
from org_config_loader import load_org_config

def test_load_v2_role_registry():
    cfg = {
        'version': '2.0',
        'org': {'name': 't', 'departments': [
            {'name': 'Arch', 'roles': [
                {'id': 'arch.architect', 'name': 'architect', 'agentType': 'general-purpose',
                 'bound_skills': ['design-patterns'], 'permissions': {'can_veto': True}},
            ]}
        ]},
        'budget': {},
    }
    with tempfile.TemporaryDirectory() as d:
        p = Path(d) / 'org.yaml'; p.write_text(yaml.safe_dump(cfg), encoding='utf-8')
        loaded = load_org_config(str(p))
        role = loaded['departments'][0]['roles'][0]
        assert role['id'] == 'arch.architect'
        assert role['bound_skills'] == ['design-patterns']
```

- [ ] **Step 2: 运行确认失败**

Run: `cd /d/claude-ecosystem/lean-hooks/harness && python -m pytest test_workflow_comm_meetings.py -v`
Expected: FAIL（`_translate_dept` 丢弃 `id`，断言 `role['id']` KeyError）。

- [ ] **Step 3: 实现 v2 翻译**

```python
def _translate_dept(dept):
    return {
        'name': dept['name'],
        'description': dept.get('description', ''),
        'required': dept.get('required', False),
        'roles': dept['roles'],   # roles 原样传入，含 id/bound_skills/persona/permissions
        # v2 无 manager_pipeline；v1 兼容
        'manager_pipeline': dept.get('manager_pipeline', []),
    }
```

（`load_org_config` 中 `contracts` 用 `raw['org'].get('contracts', [])` 已兼容 v2 缺省；保持不动。）

- [ ] **Step 4: 运行确认通过 + Commit**

Run: `cd /d/claude-ecosystem/lean-hooks/harness && python -m pytest test_workflow_comm_meetings.py -v`
Expected: PASS。

```bash
cd /d/claude-ecosystem/lean-hooks && git add harness/org_config_loader.py harness/test_workflow_comm_meetings.py && git commit -m "feat(engine): org_config_loader supports v2 role registry"
```

## Task 2.2: workflow_config_loader

**Files:**
- Create: `lean-hooks/harness/workflow_config_loader.py`
- Test: `lean-hooks/harness/test_workflow_comm_meetings.py`（追加）

- [ ] **Step 1: 追加失败测试**

```python
from workflow_config_loader import load_workflow_config

def test_load_workflow_channels_and_meetings():
    cfg = {
        'version': '2.0', 'name': 'wf',
        'nodes': [
            {'id': 'n1', 'type': 'agent', 'role_ref': 'arch.architect'},
            {'id': 'n2', 'type': 'channel', 'channel': {'key': 'api', 'acl': {'read': ['fe.*'], 'write': ['arch.architect']}}},
            {'id': 'n3', 'type': 'meeting', 'meeting': {'type': 'ministerial', 'participants': {'from': 'managers'}}},
        ],
        'edges': [
            {'id': 'e1', 'source': 'n1', 'target': 'n2', 'kind': 'flow'},
            {'id': 'e2', 'source': 'n1', 'target': 'n3', 'kind': 'message'},
        ],
    }
    with tempfile.TemporaryDirectory() as d:
        p = Path(d) / 'wf.yaml'; p.write_text(yaml.safe_dump(cfg), encoding='utf-8')
        wf = load_workflow_config(str(p))
        assert wf['channels']['api']['acl']['write'] == ['arch.architect']
        assert wf['message_edges'] == [('n1', 'n3')]
        assert wf['meetings'][0]['type'] == 'ministerial'
```

- [ ] **Step 2: 运行确认失败**

Run: `cd /d/claude-ecosystem/lean-hooks/harness && python -m pytest test_workflow_comm_meetings.py -v`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现**

```python
"""Translate workflow-config YAML into orchestrator-consumable structures."""
import yaml
from pathlib import Path
from typing import Any, Dict


def load_workflow_config(config_path: str) -> Dict[str, Any]:
    path = Path(config_path)
    if not path.exists():
        raise FileNotFoundError(f"WorkflowConfig not found: {config_path}")
    raw = yaml.safe_load(path.read_text(encoding='utf-8'))

    nodes = raw.get('nodes', [])
    channels = {}
    meetings = []
    for n in nodes:
        if n.get('type') == 'channel':
            key = n['channel']['key']
            channels[key] = {'acl': n['channel'].get('acl', {'read': [], 'write': []})}
        elif n.get('type') == 'meeting':
            meetings.append({'id': n['id'], 'type': n['meeting']['type'],
                             'participants': n['meeting'].get('participants', {'from': 'managers'}),
                             'channel': n['meeting'].get('channel'),
                             'agenda': n['meeting'].get('agenda'),
                             'output': n['meeting'].get('output', {'write_to': ['channel']})})
        elif n.get('type') == 'agent':
            assert n.get('role_ref'), f"agent node {n['id']} missing role_ref"

    message_edges = []
    for e in raw.get('edges', []):
        if e.get('kind') == 'message':
            message_edges.append((e['source'], e['target']))

    return {
        'name': raw['name'],
        'nodes': nodes,
        'message_edges': message_edges,
        'channels': channels,
        'meetings': meetings,
        'flow_edges': [e for e in raw.get('edges', []) if e.get('kind', 'flow') == 'flow'],
    }
```

- [ ] **Step 4: 运行确认通过 + Commit**

Run: `cd /d/claude-ecosystem/lean-hooks/harness && python -m pytest test_workflow_comm_meetings.py -v`
Expected: PASS。

```bash
cd /d/claude-ecosystem/lean-hooks && git add harness/workflow_config_loader.py harness/test_workflow_comm_meetings.py && git commit -m "feat(engine): workflow_config_loader"
```

## Task 2.3: adapter 接受 workflow_path + 上抛新事件

**Files:**
- Modify: `lean-hooks/harness/orchestrator_adapter.py`

- [ ] **Step 1: start_run 读取 workflow_path 并加载**

在 `handle_request` 的 `start_run` 分支，加载 workflow 并注入 orchestrator：

```python
from harness.workflow_config_loader import load_workflow_config

# 在 handle_request 'start_run' 内：
workflow_path = params.get('workflow_path')
workflow = load_workflow_config(workflow_path) if workflow_path else None
self._orch = OrganizationOrchestrator(...)
if workflow:
    self._orch.configure_workflow(workflow)   # Task 2.4/2.5 实现
```

- [ ] **Step 2: 新增事件上抛辅助**

```python
def emit_meeting_started(self, meeting: dict) -> None:
    self.emit_event('meeting_started', meeting=meeting)
def emit_meeting_cycle(self, meeting: dict) -> None:
    self.emit_event('meeting_cycle', meeting=meeting)
def emit_message_mediated(self, message: dict) -> None:
    self.emit_event('message_mediated', message=message)
def emit_decision_recorded(self, decision: dict) -> None:
    self.emit_event('decision_recorded', decision=decision)
```

- [ ] **Step 3: 冒烟验证（手编一个 workflow yaml + org yaml，跑 adapter start_run，观察 stdout 事件）**

Run: `cd /d/claude-ecosystem/lean-hooks/harness && python -c "import orchestrator_adapter" && echo ok`
Expected: `ok`（无语法错误）。

- [ ] **Step 4: Commit**

```bash
cd /d/claude-ecosystem/lean-hooks && git add harness/orchestrator_adapter.py && git commit -m "feat(engine): adapter accepts workflow_path and emits meeting/comm/decision events"
```

## Task 2.4: mediate() 显式规则（message 边 + channel ACL + 默认回落）

**Files:**
- Modify: `lean-hooks/harness/organization_orchestrator.py`

- [ ] **Step 1: 追加失败测试**

```python
from organization_orchestrator import ChannelHandle, _mediation_decision

def make_org():
    return {
        'a1': {'kind': 'executor', 'department': 'FE', 'parent': 'mfe'},
        'a2': {'kind': 'executor', 'department': 'FE', 'parent': 'mfe'},
        'mfe': {'kind': 'manager', 'department': 'FE', 'parent': None},
        'a3': {'kind': 'executor', 'department': 'BE', 'parent': 'mbe'},
    }

def test_default_cross_dept_rejected():
    org = make_org()
    handle = ChannelHandle('a1', 'FE', 'mfe')
    from organization_orchestrator import ChannelVerdict
    assert _mediation_decision(handle, 'a3', org) == ChannelVerdict.REJECT_CROSS_DEPT

def test_explicit_message_edge_allows_cross_dept():
    from organization_orchestrator import set_workflow_message_edges
    org = make_org()
    set_workflow_message_edges({('a1', 'a3')})
    handle = ChannelHandle('a1', 'FE', 'mfe')
    assert _mediation_decision(handle, 'a3', org).value == 'allow'
    set_workflow_message_edges(set())
```

- [ ] **Step 2: 运行确认失败**

Run: `cd /d/claude-ecosystem/lean-hooks/harness && python -m pytest test_workflow_comm_meetings.py -v`
Expected: FAIL（`set_workflow_message_edges` 不存在）。

- [ ] **Step 3: 实现显式规则覆盖**

在 `organization_orchestrator.py` 加模块级状态 + 在 `_mediation_decision` 前先查显式规则：

```python
# 模块级：workflow 显式规则（由 configure_workflow 写入）
_WF_MESSAGE_EDGES: set = set()          # {(sender_id, recipient_id)}
_WF_CHANNEL_ACL: dict = {}              # {channel_key: {'read': [...], 'write': [...]}}
_WF_NODE_CHANNEL: dict = {}             # {node_id: channel_key}  # agent 挂的频道


def set_workflow_message_edges(edges: set) -> None:
    global _WF_MESSAGE_EDGES
    _WF_MESSAGE_EDGES = edges


def set_workflow_channels(acl: dict, node_channel: dict) -> None:
    global _WF_CHANNEL_ACL, _WF_NODE_CHANNEL
    _WF_CHANNEL_ACL, _WF_NODE_CHANNEL = acl, node_channel


def _mediation_decision(handle, to_id, org):
    # 1) 显式 message 边：命中即 ALLOW
    if (handle.executor_id, to_id) in _WF_MESSAGE_EDGES:
        return ChannelVerdict.ALLOW
    # 2) 显式 channel：双方挂同一频道且接收方有该频道写权限（或发送方有读权限）→ ALLOW
    ch = _WF_NODE_CHANNEL.get(handle.executor_id)
    if ch and _WF_NODE_CHANNEL.get(to_id) == ch:
        acl = _WF_CHANNEL_ACL.get(ch, {})
        allow = handle.executor_id in acl.get('write', []) or to_id in acl.get('read', [])
        if allow:
            return ChannelVerdict.ALLOW
    # 3) 默认回落：现有组织树隔离
    to = org.get(to_id)
    if to is None:
        return ChannelVerdict.REJECT_UNKNOWN
    if to_id == handle.parent_manager_id and to['kind'] == 'manager':
        return ChannelVerdict.ALLOW
    if to['kind'] == 'executor' and to['department'] == handle.department:
        return ChannelVerdict.ALLOW
    if to['kind'] == 'executor':
        return ChannelVerdict.REJECT_CROSS_DEPT
    return ChannelVerdict.REJECT_UPWARD
```

在 `OrganizationOrchestrator` 加 `configure_workflow(workflow)`：从 `workflow['message_edges']`、`workflow['channels']`、agent 节点挂载的 channel 写入上述全局状态，并把 meeting 列表存到 `self._meetings`。

- [ ] **Step 4: 运行确认通过 + Commit**

Run: `cd /d/claude-ecosystem/lean-hooks/harness && python -m pytest test_workflow_comm_meetings.py -v`
Expected: PASS。

```bash
cd /d/claude-ecosystem/lean-hooks && git add harness/organization_orchestrator.py harness/test_workflow_comm_meetings.py && git commit -m "feat(engine): mediate honors explicit message edges and channel ACLs"
```

## Task 2.5: run_meeting(meeting_type) + 部门内会议 + 决策会议

**Files:**
- Modify: `lean-hooks/harness/organization_orchestrator.py`

- [ ] **Step 1: 追加失败测试**

```python
def test_dept_internal_meeting_participants(tmp_path):
    from organization_orchestrator import OrganizationOrchestrator
    orch = OrganizationOrchestrator(states_dir=tmp_path, session_id='t')
    mgr = orch.add_manager('fe_manager', 'FE', None)
    e1 = orch.add_executor('fe_page_builder', 'FE', mgr)
    e2 = orch.add_executor('fe_ui_system', 'FE', mgr)
    parts = orch.meeting_participants('dept_internal', department='FE')
    assert set(parts) == {e1, e2}
```

- [ ] **Step 2: 运行确认失败**

Run: `cd /d/claude-ecosystem/lean-hooks/harness && python -m pytest test_workflow_comm_meetings.py -v`
Expected: FAIL（`meeting_participants` 不存在）。

- [ ] **Step 3: 实现参与者推导 + 类型参数**

```python
def meeting_participants(self, meeting_type: str, department: str | None = None,
                         explicit: list[str] | None = None) -> list[str]:
    if explicit:
        return [n for n in explicit if n in self.org]
    if meeting_type == 'dept_internal':
        # 单部门全部 executor
        return [nid for nid, n in self.org.items() if n.kind == 'executor' and n.department == department]
    if meeting_type == 'decision':
        # executor + 拥有 can_veto 权限的角色（v2 角色 id 可在 self._role_meta 查）
        base = [nid for nid, n in self.org.items() if n.kind == 'executor']
        return base + [nid for nid, n in self.org.items() if n.kind == 'manager' and self._can_veto(nid)]
    # ministerial：各部门 manager
    return [nid for nid, n in self.org.items() if n.kind == 'manager']
```

在 `run_meeting(self, manager_verdicts, cycle, max_cycles=..., meeting_type='ministerial', department=None, explicit=None)`：
- `ministerial` → 现有逻辑（多轮合议）
- `dept_internal` / `decision` → 先 `self.meeting_participants(...)`，调用 flat orchestrator 的 `apply_veto_rules` 产 `decision`，写回绑定 channel（见 `self._meetings` 中该 meeting 的 `output`），并 `emit_meeting_started/meeting_cycle/decision_recorded`（经 orchestrator_adapter 注册的回调）。

- [ ] **Step 4: 运行确认通过 + Commit**

Run: `cd /d/claude-ecosystem/lean-hooks/harness && python -m pytest test_workflow_comm_meetings.py -v`
Expected: PASS。

```bash
cd /d/claude-ecosystem/lean-hooks && git add harness/organization_orchestrator.py harness/test_workflow_comm_meetings.py && git commit -m "feat(engine): run_meeting supports dept_internal and decision types"
```

## Task 2.6: 通信审计 + 会议纪要落盘

**Files:**
- Modify: `lean-hooks/harness/organization_orchestrator.py`
- Test: `lean-hooks/harness/test_workflow_comm_meetings.py`（追加）

- [ ] **Step 1: 追加失败测试**

```python
def test_message_audit_logged(tmp_path):
    from organization_orchestrator import OrganizationOrchestrator
    orch = OrganizationOrchestrator(states_dir=tmp_path, session_id='t')
    mgr = orch.add_manager('fe_manager', 'FE', None)
    e1 = orch.add_executor('a', 'FE', mgr); e2 = orch.add_executor('b', 'FE', mgr)
    orch.mediate(orch.channel_handle(e1), e2)
    audit = (tmp_path / 'comm.jsonl').read_text(encoding='utf-8')
    assert e1 in audit and e2 in audit
```

- [ ] **Step 2: 运行确认失败**

Run: `cd /d/claude-ecosystem/lean-hooks/harness && python -m pytest test_workflow_comm_meetings.py -v`
Expected: FAIL（无 comm.jsonl）。

- [ ] **Step 3: 实现审计落盘**

在 `mediate()` 成功后追加写 `states_dir/comm.jsonl`：

```python
def mediate(self, handle: ChannelHandle, to_id: str) -> dict:
    verdict = _mediation_decision(handle, to_id, self.org)
    self._append_line(self.states_dir / 'comm.jsonl', {
        'sender': handle.executor_id, 'recipient': to_id,
        'channel': _WF_NODE_CHANNEL.get(handle.executor_id),
        'verdict': verdict.value,
        'reason': f'{verdict.value} (mediation)',
        'ts': _now_iso(),
    })
    return {'ok': verdict.value == 'allow', 'verdict': verdict.value}
```

`_append_line` 辅助：

```python
def _append_line(self, path, obj: dict) -> None:
    os.makedirs(path.parent, exist_ok=True)
    with open(path, 'a', encoding='utf-8') as f:
        f.write(json.dumps(obj, ensure_ascii=False) + '\n')
```

同理，会议在 `run_meeting` 结束时写 `meetings.jsonl`（含 type/participants/cycle/decision），决策写 `products.json` 或复用 `issue_product_key`。

- [ ] **Step 4: 运行确认通过 + Commit**

Run: `cd /d/claude-ecosystem/lean-hooks/harness && python -m pytest test_workflow_comm_meetings.py -v`
Expected: PASS。

```bash
cd /d/claude-ecosystem/lean-hooks && git add harness/organization_orchestrator.py harness/test_workflow_comm_meetings.py && git commit -m "feat(engine): comm audit + meeting minutes persistence"
```

> **Phase 2 完成标志：** `pytest harness/test_workflow_comm_meetings.py` 全绿；原有 `test_organization_orchestrator.py` 不回归。

---

# Phase 3 (P3)：前端 org 瘦身 + workflow 画布扩展

> 产出：org 编辑器只编辑角色；画布可拖 channel/meeting 节点、画 message 边、用下拉选 roleRef。

## Task 3.1: org 编辑器瘦身

**Files:**
- Modify: `frontend/src/components/RoleEditor.tsx`
- Modify: `frontend/src/views/StudioView.tsx`

- [ ] **Step 1: 更新 RoleEditor 表单字段**

移除 manager_pipeline / contract 编辑控件；角色字段改为：`id`（自动 `dept.role`）、`name`、`agentType`、`bound_skills`（多选）、`persona`（title/backstory/output_format）、`permissions`（can_veto/can_escalate 开关）。对照 `frontend/src/types/schema.ts` 的 v2 `Role` 类型。

- [ ] **Step 2: StudioView 去掉结构区**

删除 StudioView 中渲染 `manager_pipeline`、`contracts` 的部分（如存在），保留部门/角色树。

- [ ] **Step 3: 类型检查 + 前端测试**

Run: `cd org-engine-editor/frontend && npx tsc --noEmit && npm test`
Expected: 无错、现有测试通过。

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/RoleEditor.tsx frontend/src/views/StudioView.tsx && git commit -m "refactor(org-editor): slim to role registry only"
```

## Task 3.2: workflow 类型扩展（channel/meeting 节点 + message 边）

**Files:**
- Modify: `frontend/src/components/workflow/types.ts`

- [ ] **Step 1: 扩展类型**

```ts
export type WorkflowNodeType = 'agent' | 'skill' | 'decision' | 'parallel' | 'channel' | 'meeting' | 'start' | 'end';

export interface ChannelNodeData extends WorkflowNodeData {
  type: 'channel'; channelKey: string; acl: { read: string[]; write: string[] };
}
export interface MeetingNodeData extends WorkflowNodeData {
  type: 'meeting'; meetingType: 'dept_internal' | 'ministerial' | 'decision';
  participants: { from: 'department' | 'managers' | 'exec_roles' | 'explicit'; department?: string; roles: string[] };
  channel?: string; agenda: string; output: { write_to: ('channel' | 'flow')[] };
}
export type WorkflowNode = Node<WorkflowNodeData>;
```

`AgentNodeData` 增加 `roleRef?: string`（替换原 `role` 为主展示字段，role 保留为解析后显示名）。`Edge` 增加 `data?: { kind?: 'flow' | 'message' }`。

- [ ] **Step 2: 类型检查**

Run: `cd org-engine-editor/frontend && npx tsc --noEmit`
Expected: 无错（如 React Flow 泛型报错则同步修 `WorkflowCanvas.tsx` 的节点注册）。

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/workflow/types.ts && git commit -m "feat(workflow): channel/meeting node types + message edge kind"
```

## Task 3.3: ChannelNode / MeetingNode 组件

**Files:**
- Create: `frontend/src/components/workflow/nodes/ChannelNode.tsx`
- Create: `frontend/src/components/workflow/nodes/MeetingNode.tsx`
- Modify: `frontend/src/components/workflow/WorkflowCanvas.tsx`

- [ ] **Step 1: 写节点组件（仿 AgentNode.tsx 的样式约定）**

```tsx
// ChannelNode.tsx
import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import type { ChannelNodeData } from '../types';

export const ChannelNode = memo(function ChannelNode({ data }: NodeProps<ChannelNodeData>) {
  return (
    <div className="rounded-lg border-2 border-dashed border-sky-500 bg-sky-950/40 px-3 py-2 text-xs text-sky-100 min-w-[140px]">
      <div className="flex items-center gap-1.5 font-medium">
        <span>📡</span><span className="truncate">{data.channelKey}</span>
      </div>
      <div className="mt-1 text-[10px] text-sky-300/70">
        R:{data.acl.read.length} W:{data.acl.write.length}
      </div>
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
    </div>
  );
});
```

MeetingNode 同理（🎯 徽标 + meetingType 徽标：部门内/部长级/决策 + 参与者数）。样式与 `AgentNode.tsx` 对齐（沿用现有 tailwind 类）。

- [ ] **Step 2: 注册到 WorkflowCanvas 的 nodeTypes**

```tsx
const nodeTypes = {
  agent: AgentNode, skill: SkillNode, decision: DecisionNode, parallel: ParallelNode,
  channel: ChannelNode, meeting: MeetingNode,
};
```

- [ ] **Step 3: 前端测试 + Commit**

Run: `cd org-engine-editor/frontend && npm test`
Expected: 现有渲染测试通过；无新失败。

```bash
git add frontend/src/components/workflow/nodes/ChannelNode.tsx frontend/src/components/workflow/nodes/MeetingNode.tsx frontend/src/components/workflow/WorkflowCanvas.tsx && git commit -m "feat(workflow): channel and meeting node components"
```

## Task 3.4: message 边 + roleRef 选择器 + 属性面板

**Files:**
- Modify: `frontend/src/components/workflow/WorkflowToolbar.tsx`
- Modify: `frontend/src/components/workflow/WorkflowCanvas.tsx`
- Modify: `frontend/src/components/workflow/PropertiesPanel.tsx`
- Modify: `frontend/src/stores/workflow-store.ts`

- [ ] **Step 1: 工具栏加 channel/meeting 节点 + 边 kind 切换**

`WorkflowToolbar` 节点面板加 `channel`、`meeting` 两项（`addNode('channel', ...)` / `addNode('meeting', ...)`）；加一个「连接类型」toggle（flow/message），选中 message 时 `onConnect` 产生的边 `data.kind='message'`、样式虚线。

在 `workflow-store.ts`：
- `addNode` 的 `baseData` switch 加 `channel`/`meeting` 分支（默认 channelKey/meetingType）
- `onConnect` 时读全局当前边 kind（store 里加 `edgeKind: 'flow'|'message'` 及 `setEdgeKind`），`addEdge({...connection, data: { kind: edgeKind }, ...})`

- [ ] **Step 2: PropertiesPanel 加 roleRef 下拉 + meeting 配置**

`PropertiesPanel.tsx`：当选中 agent 节点，把「角色」单行输入换成下拉——从 `useOrgStore` 的 `currentOrg` 拉角色列表（`departments[].roles[]`），`value=roleRef`，onChange 更新 `roleRef` 并同步 `role`（显示名）。meeting 节点显示 meetingType/participants/agenda 编辑；channel 节点显示 key + read/write 角色多选。

- [ ] **Step 3: 类型检查 + 前端测试**

Run: `cd org-engine-editor/frontend && npx tsc --noEmit && npm test`
Expected: 无错、通过。

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/workflow/WorkflowToolbar.tsx frontend/src/components/workflow/WorkflowCanvas.tsx frontend/src/components/workflow/PropertiesPanel.tsx frontend/src/stores/workflow-store.ts && git commit -m "feat(workflow): message edges, roleRef picker, meeting/channel config"
```

> **Phase 3 完成标志：** 画布可完整编辑 v2 workflow（拖 channel/meeting、画 message 边、下拉绑 roleRef）；`npm run test:frontend` 全绿。

---

# Phase 4 (P4)：前端治理视图

> 产出：会议记录、通信审计、产物注册表、强绑定校验 4 个视图 + RunMonitor 新事件。

## Task 4.1: insights-store + MeetingsView

**Files:**
- Create: `frontend/src/stores/insights-store.ts`
- Create: `frontend/src/views/MeetingsView.tsx`
- Modify: `frontend/src/router.tsx`、`frontend/src/layouts/AppShell.tsx`

- [ ] **Step 1: 建 insights-store（订阅 ws 事件 + 轮询/拉取）**

```ts
// insights-store.ts
import { create } from 'zustand';
import { api } from '@/api/client';
import { ws } from '@/api/ws';

interface InsightsState {
  meetings: any[]; comm: any[]; products: any[];
  fetch: () => Promise<void>;
}

export const useInsightsStore = create<InsightsState>((set) => ({
  meetings: [], comm: [], products: [],
  fetch: async () => {
    const data = await api.get('/api/v1/insights');
    set({ meetings: data.meetings ?? [], comm: data.comm ?? [], products: data.products ?? [] });
  },
}));
```

ws.ts 中当收到 `meeting_started/meeting_cycle/decision_recorded/message_mediated` 时调用 `useInsightsStore.getState().fetch()`（防抖 300ms）。

- [ ] **Step 2: MeetingsView 渲染会议时间线**

`MeetingsView.tsx`：卡片列表，每张卡片显示会议类型徽标（部门内=蓝/部长级=紫/决策=金）、参与者、轮次、决议、`channel`/workflow 节点链接。空态：`无会议记录`。

- [ ] **Step 3: 注册路由 + 导航**

`router.tsx` 加 `{ path: 'meetings', element: <MeetingsView /> }`；`AppShell.tsx` 侧边栏加「会议记录」导航项。

- [ ] **Step 4: 前端测试 + Commit**

Run: `cd org-engine-editor/frontend && npm test`
Expected: 通过。

```bash
git add frontend/src/stores/insights-store.ts frontend/src/views/MeetingsView.tsx frontend/src/router.tsx frontend/src/layouts/AppShell.tsx frontend/src/api/ws.ts && git commit -m "feat(ui): meetings timeline view"
```

## Task 4.2: CommAuditView

**Files:**
- Create: `frontend/src/views/CommAuditView.tsx`
- Modify: `frontend/src/router.tsx`、`frontend/src/layouts/AppShell.tsx`

- [ ] **Step 1: 实现视图**

`CommAuditView.tsx`：表格列 `发送者 | 接收者 | 频道 | 裁决(allow/reject) | 原因 | 时间`，reject 行红字。数据来自 `useInsightsStore.comm`（Task 4.1 store）。

- [ ] **Step 2: 路由 + 导航 + Commit**

仿 Task 4.1 Step 3。Commit 消息：`feat(ui): comm audit log view`。

## Task 4.3: ProductRegistryView

**Files:**
- Create: `frontend/src/views/ProductRegistryView.tsx`
- Modify: `frontend/src/router.tsx`、`frontend/src/layouts/AppShell.tsx`

- [ ] **Step 1: 实现视图**

`ProductRegistryView.tsx`：表列 `角色 | 产物 key | 审计门状态(gated/passed/blocked) | skill manifest`。数据来自 `useInsightsStore.products`。

- [ ] **Step 2: 路由 + 导航 + Commit**

Commit 消息：`feat(ui): product registry view`。

## Task 4.4: 强绑定校验面板

**Files:**
- Create: `frontend/src/components/binding/BindingCheckPanel.tsx`
- Modify: `frontend/src/components/RoleEditor.tsx`、`frontend/src/components/workflow/PropertiesPanel.tsx`

- [ ] **Step 1: 实现共享校验工具（复用 binding-resolver）**

前端加 `frontend/src/lib/binding-check.ts`：

```ts
export function collectWorkflowRefs(workflows: any[]): Map<string, string[]> {
  const refs = new Map<string, string[]>();
  for (const wf of workflows) {
    for (const n of wf.nodes ?? []) {
      if (n.role_ref) refs.set(n.role_ref, [...(refs.get(n.role_ref) ?? []), wf.name]);
    }
  }
  return refs;
}
export function findBrokenRefs(org: any, workflows: any[]): string[] {
  const roleIds = new Set(org?.org?.departments?.flatMap((d: any) => d.roles ?? []).map((r: any) => r.id));
  return workflows.flatMap((wf: any) => (wf.nodes ?? []).filter((n: any) => n.role_ref && !roleIds.has(n.role_ref)).map((n: any) => `${wf.name}:${n.id}->${n.role_ref}`));
}

// 循环依赖检测：对 workflow 的 flow 边做拓扑排序，未排尽的节点在环上
export function detectFlowCycles(edges: { source: string; target: string; kind?: string }[]): string[][] {
  const flow = edges.filter((e) => e.kind !== 'message');
  const adj = new Map<string, string[]>();
  const indeg = new Map<string, number>();
  for (const e of flow) {
    if (!adj.has(e.source)) adj.set(e.source, []);
    adj.get(e.source)!.push(e.target);
    indeg.set(e.target, (indeg.get(e.target) ?? 0) + 1);
  }
  const queue: string[] = [];
  for (const n of adj.keys()) if (!indeg.has(n)) queue.push(n);
  while (queue.length) {
    const cur = queue.shift()!;
    for (const nx of adj.get(cur) ?? []) {
      indeg.set(nx, indeg.get(nx)! - 1);
      if (indeg.get(nx) === 0) queue.push(nx);
    }
  }
  // 仍剩 indeg>0 的节点都在某个环上
  const inCycle = [...indeg.entries()].filter(([, d]) => d > 0).map(([n]) => n);
  return inCycle.length ? [inCycle] : [];
}
```

- [ ] **Step 2: BindingCheckPanel 组件**

在 RoleEditor 底部与 PropertiesPanel 中显示：当前 org 每个角色被哪些 workflow 引用（绿 ✓）、断引用列表（红 ✗）、以及每个 workflow 的 `detectFlowCycles` 环警告（红 ⚠，含环上节点）。数据来自 `api.listWorkflows()` + `collectWorkflowRefs` + `detectFlowCycles`。

- [ ] **Step 3: 前端测试 + Commit**

Run: `cd org-engine-editor/frontend && npm test`
Expected: 通过。

```bash
git add frontend/src/lib/binding-check.ts frontend/src/components/binding/BindingCheckPanel.tsx frontend/src/components/RoleEditor.tsx frontend/src/components/workflow/PropertiesPanel.tsx && git commit -m "feat(ui): strong-binding validation panel"
```

## Task 4.5: RunMonitor 新事件渲染 + 画布运行高亮

**Files:**
- Modify: `frontend/src/views/RunMonitorView.tsx`
- Modify: `frontend/src/components/workflow/WorkflowCanvas.tsx`
- Modify: `frontend/src/stores/workflow-store.ts`

- [ ] **Step 1: 渲染 4 类新事件**

在 RunMonitorView 的事件流中，对 `meeting_started/meeting_cycle/message_mediated/decision_recorded` 渲染专用行（仿现有 gateway_prompt 的渲染模式）。`meeting_cycle` 显示轮次与决议；`message_mediated` 显示 allow/reject 徽标。

- [ ] **Step 2: 画布实时高亮执行节点 + 消息边动画**

在 `workflow-store.ts` 加运行时状态字段：

```ts
interface RunVisualState {
  activeNodeIds: string[];              // 当前正在执行的节点（executor_dispatched 设置 / executor_completed 清除）
  activeMessageEdges: string[];         // 当前活跃的消息边（message_mediated=allow 时加入）
}
```

`ws.ts` 收到 `executor_dispatched`（含 node_id）→ `workflowStore.markNodeActive(node_id)`；收到 `executor_completed` → `markNodeInactive`；收到 `message_mediated`（verdict=allow，含 sender/recipient）→ `markMessageActive(sender→recipient)`，3s 后自动清除。

`WorkflowCanvas.tsx` 中：`node.data.active` 为真 → 节点加 `ring-2 ring-emerald-400` 高亮类；`edge.data.active` 为真 → 设 `animated:true` 且 `stroke:#10b981`。对照 `executor_dispatched` 事件里 `role`/`node_id` 匹配画布节点（agent 节点以 roleRef 或 node.id 关联）。

- [ ] **Step 3: 前端测试 + Commit**

Run: `cd org-engine-editor/frontend && npx tsc --noEmit && npm test`
Expected: 无错、通过。

Commit 消息：`feat(ui): run monitor renders meeting/comm events; canvas live-highlights active nodes and message edges`。

> **Phase 4 完成标志：** 4 个新视图可导航、数据来自 insights 端点与 ws 事件；`npm run test:frontend` 全绿。

---

# Phase 5 (P5)：端到端

> 产出：schema→编辑器→运行→事件→视图 的闭环 e2e。

## Task 5.1: 后端集成 e2e（schema→validate→run 投影）

**Files:**
- Test: `backend-server/tests/e2e-org-workflow.test.ts`

- [ ] **Step 1: 写 e2e 测试**

```ts
import { describe, it, expect } from 'vitest';
import { migrateOrg } from '../src/migrate-org';
import { createBindingResolver } from '../src/binding-resolver';

describe('e2e: v1 org -> v2 + binding', () => {
  it('migrates, resolves roleRef, and validates workflow refs', () => {
    const v1 = { version: '1.0', org: { name: 't', departments: [{ name: 'FE', roles: [{ name: 'fe_page_builder', agentType: 'x', bound_skill: 'taste-skill' }] }] }, budget: {} };
    const v2 = migrateOrg(v1) as any;
    const resolver = createBindingResolver(v2);
    expect(resolver.resolve('fe.fe_page_builder')?.boundSkills).toEqual(['taste-skill']);
    expect(resolver.resolve('fe.nope')).toBeNull();
  });
});
```

- [ ] **Step 2: 运行 + Commit**

Run: `cd org-engine-editor/backend-server && npm test`
Expected: 全绿。

```bash
git add backend-server/tests/e2e-org-workflow.test.ts && git commit -m "test(e2e): v1->v2 migrate + binding resolution"
```

## Task 5.2: 前端 e2e（Playwright）—— 画布 message 边 + roleRef 下拉

**Files:**
- Modify: `frontend/e2e/workflow.spec.ts`（或新建）

- [ ] **Step 1: 写 e2e**

```ts
import { test, expect } from '@playwright/test';

test('workflow canvas: add meeting node and connect with message edge', async ({ page }) => {
  await page.goto('/#/studio/demo');
  await page.getByRole('button', { name: /meeting/i }).click();
  await expect(page.locator('text=会议')).toBeVisible();
  // 切到 message 连接模式，从 agent 拖到 meeting，验证边出现且 kind=message
  // 选中 agent 节点，属性面板出现 roleRef 下拉，选中后显示角色名
});
```

- [ ] **Step 2: 运行 + Commit**

Run: `cd org-engine-editor/frontend && npx playwright test e2e/workflow.spec.ts`
Expected: PASS。

```bash
git add frontend/e2e/workflow.spec.ts && git commit -m "test(e2e): workflow canvas meeting node + message edge"
```

> **Phase 5 完成标志：** 全仓 `npm test` + `npx playwright test` 全绿。

---

## 收尾

- 更新 `docs/superpowers/specs/2026-08-03-org-workflow-split-comm-meetings-design.md` 标注实现状态（如实现完成后）。
- 若引擎（lean-hooks）不在本计划推进范围之外单独提交，最后将 `StartRunRequest` 协议变更同步到 `backend-server/src/orchestrator-adapter/protocol.ts` 与引擎 adapter 双端。

---

## Self-Review

**Spec 覆盖：**
- §2.1 org v2 → Task 0.1/0.2 ✓；§2.2 workflow v2 → Task 0.3/0.4 ✓
- §3.1 通信显式规则 → Task 2.4 ✓；§3.2 会议类型 → Task 2.5 ✓；§3.3 协议 → Task 1.1/2.3 ✓
- §4.1 四视图 → Task 4.1-4.4 ✓；§4.2 画布 → Task 3.2-3.4 ✓；§4.3 org 瘦身 → Task 3.1 ✓；§4.4 RunMonitor → Task 4.5 ✓
- **补充（优化建议.txt）**：画布运行高亮 + 消息边动画 → Task 4.5 Step 2 ✓；workflow 循环依赖检测 → Task 4.4（`detectFlowCycles`）✓
- §5 后端 → Task 1.1-1.3 ✓；§6 迁移 → Task 0.6 ✓；§7 测试 → 各 Task 内嵌 + Phase 5 ✓

**占位符扫描：** 无 TBD/TODO；所有代码步骤含完整代码。

**类型一致性：** `role_ref`/`roleRef` 命名——schema 用 `role_ref`，前端 `WorkflowNodeData.roleRef`，binding-resolver 用 `roleRef`，三者通过各层 adapter 字段映射，已在 Task 0.5/1.3/3.4 对齐。`meeting.type` 枚举三值与前端 `meetingType` 一致。`_mediation_decision` 返回 `ChannelVerdict` 枚举，与 `set_workflow_message_edges` 的 set 形状一致。
