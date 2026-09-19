---
name: org-engine
description: >
  多智能体组织引擎 — 将一个任务分解为 L1 审议→L2 部门拆分/主管会议→L3 执行者
  (subagent+skill 绑定)→汇集审计→三关口(你审批)的完整流程。
  使用场景: 大型多领域项目、需跨部门协作、需强制审计/skill 绑定的任务。
  用法: /org-engine <任务描述>
  输出: 产出的 HTML/代码/文档 写入 org_engine_demo_output/
---

# org-engine Skill

## 1. 入口参数

- `task`: 任务描述 (必须)
- `departments`: 使用的部门列表 (默认: Arch, FE, Docs; 可选 BE, QA, Sec, Data, Design)
- `output_dir`: 输出目录 (默认: `org_engine_demo_output/`)

## 2. 流程 (强制，不可跳过)

### Phase 1: L1 审议
- 调用 `organization_orchestrator.deliberate()` -> 产出可行性/必要性/预算评估
- **暂停，AskUserQuestion 等你审批** (Gateway #1)
- 如果拒绝 → 终止并返回

### Phase 2: L2 拆分 + 契约
- 调用 `decompose_into_departments()` 拆分为指定部门
- Arch 部门起草契约 (`contracts.draft()`)
- 注册部门依赖 (`contracts.register_dependency()`)
- **所有执行者必须只读消费契约** (version-locked)

### Phase 3: L3 执行 (强制使用 subagent + real skill)
- 每个执行者 = `add_executor(role, dept, manager, depth=3)`
- 执行者必须真实 spawn subagent，调用绑定的 Skill 工具
- Skill 必须从 `.claude/skills/<name>/SKILL.md` 加载真实内容
- Prompt 构造: `org_skill_loader.inject_into_prompt(skill_name, brief)`
- **执行者必须调用 `Skill` 工具**，不能只在文本里提到 skill 名称
- `record_accountability()` 记录 did/how/evidence + SkillManifest
- `audit_accountability()` 审计 (evidence 必须匹配真实 skill 文件内容)

### Phase 4: 汇集 + 审计链
- `collect_and_audit_chain()` 逐层审查
- 主管必须审计全部下游执行者，全部通过才汇集
- 任一未过 → 状态置 blocked → 升级 Gateway #2

### Phase 5: 三关口
- **Gateway #1**: L1 审议后你审批 (AskUserQuestion)
- **Gateway #2**: 协商超限/审计失败时你仲裁
- **Gateway #3**: 最终报告你决策是否接受

### Phase 6: 产出
- 产物签发: `issue_product_key(node_id, product_key)`
- 写入 `output_dir/<product_key>`
- 审计日志: `generate_summary_report()` 显示完整时间线

## 3. 强制审计规则 (不可绕过)

1. **Skill 绑定强制**: 执行者的 `SkillManifest.skill_used` 必须等于 `bound_skill`
2. **Evidence 真实强制**: `validate_evidence()` 必须验证 evidence 引用真实 skill 文件内容 —— 模型不能伪造
3. **审计准入**: 只有 `audit_accountability()` 通过的节点才能 `issue_product_key()`
4. **通信边界**: 同部门放行，跨部门拒绝，必须经主管会议
5. **契约版本化**: 契约变更必须经 `propose_change()` → `ratify()`，不能私改
6. **预算上限**: 协商 ≤ 3 轮，超限升级

## 4. 输出格式

产出文件统一写入 `org_engine_demo_output/`，包括:
- 签发产物（HTML/文档/代码）
- `contract.json`（本次契约版本）
- `audit-report.json`（审计总结报告）

## 5. 验证

完成任务后必须运行:
```bash
PYTHONPATH=harness python harness/test_accountability.py  # 审计测试
PYTHONPATH=harness python harness/test_ecosystem_bridge.py  # 桥接测试
# 以及产出文件验证
```

## 6. 示例

```bash
/org-engine Build a single-page responsive website introducing lean-hooks and org-engine
```
