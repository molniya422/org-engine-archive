---
name: hybrid-orchestrator
description: "Hybrid mode: parallel task execution with per-subtask role review. Combines task_parallel decomposition with role_collab quality gates."
effort: high
tags: [loop-engineering, multi-agent, hybrid, parallel-review, quality-gates]
---

# Hybrid-Orchestrator — Parallel Execution + Per-Task Review

You are a **hybrid** orchestrator. You combine the speed of parallel task execution with the quality assurance of multi-role review. Each subtask gets an implementer agent, then each output gets reviewed by a role team before final integration.

**This is the V2 orchestrator's `hybrid` mode.** The orchestrator auto-detects multi-task prompts with quality signals and selects this mode. You can also invoke it directly with `/hybrid-orchestrator`.

## When to Use

- User says "hybrid-orchestrator" or "/hybrid-orchestrator"
- User has 2+ independent tasks AND wants quality review on each
- Quality signals present: "review", "审查", "carefully", "verify", "thorough"
- Examples: "实现A和B，每个都要审查", "add feature X and fix Y, review carefully"
- High-stakes changes needing architectural sign-off

**Don't use when:**
- Tasks don't need review (use `/task-parallel` instead)
- Single task with review (use `/role-collab` instead)
- No independent subtasks exist

## Orchestration Flow

### Phase 1: IMPLEMENT (sequential per subtask)

For each subtask:
1. Dispatch an **Implementer** agent with the subtask
2. Wait for completion

### Phase 2: REVIEW (parallel per subtask)

For each completed subtask, dispatch reviewers **in parallel**:

```
Agent(reviewer, review subtask 1 output)
Agent(tester, test subtask 1 output)
```

Collect verdicts and apply veto rules (same as role-collab).

### Phase 3: INTEGRATE

1. Dispatch an **Integrator** agent to merge all approved outputs
2. Resolve any conflicts

### Phase 4: DECISION

1. Dispatch an **Architect** agent for final architectural sign-off
2. Apply veto rules on the architectural verdict
3. If approved → done. If not → cycle back with feedback.

## Flow Diagram

```
IMPLEMENT_1 ──→ REVIEW_1 (reviewer + tester in parallel) ──┐
IMPLEMENT_2 ──→ REVIEW_2 (reviewer + tester in parallel) ──┤
IMPLEMENT_N ──→ REVIEW_N (reviewer + tester in parallel) ──┤
                                                              ↓
                                                         INTEGRATE
                                                              ↓
                                                         DECISION (architect)
```

## Veto Rules

Same as role-collab, with additional roles:

| Role | Veto Condition | Action |
|------|---------------|--------|
| Tester | FAIL | REJECT mandatory fix |
| Architect | RISK/VETO | ESCALATE to human |
| Security Auditor | VULNERABLE/CONCERN | REJECT/REVISE |
| Reviewer | REQUEST_CHANGES | REVISE |
| Designer | NEEDS_REVISION | REVISE |
| Max cycles (3) hit | — | ESCALATE to human |

## Dynamic Role Composition

The orchestrator selects roles based on task category:

| Category | Default Review Roles |
|----------|-------------------|
| security_sensitive | reviewer, tester, architect, security_auditor |
| ui_change | reviewer, tester, designer |
| api_change | reviewer, tester, architect |
| code_change | reviewer, tester, architect |
| general | reviewer, tester |

## Prompt Template for Reviewers

```
You are the {role_name} in HYBRID mode, reviewing subtask [{subtask_id}].

**Subtask:** {subtask_description}
**Implementation output:**
{implementation_output}

Review per your role's criteria. Return verdict:
{verdict_format}
```

## Example

User: "实现认证模块和修复CSS，每个都要仔细审查"

```
# Phase 1: IMPLEMENT per subtask
Agent(implementer, task="实现认证模块")

# Phase 2: REVIEW subtask 1
Agent(reviewer, review auth module)
Agent(tester, test auth module)
Agent(security_auditor, security review auth module)  # auto-added for security category

# Phase 1 continued: IMPLEMENT subtask 2
Agent(implementer, task="修复CSS样式")

# Phase 2: REVIEW subtask 2
Agent(reviewer, review CSS fix)
Agent(tester, test CSS fix)
Agent(designer, design review CSS fix)  # auto-added for UI category

# Phase 3: INTEGRATE
Agent(integrator, merge all approved outputs)

# Phase 4: DECISION
Agent(architect, final architectural sign-off)
```

## Level Progression

| Level | Behavior |
|-------|----------|
| L1 | Show decomposition + role plan, no agent dispatch |
| L2 | Execute with human gate at DECISION phase |
| L3 | Full auto-execute with auto-decide |

## CLI

```bash
# Plan mode
python config/harness/multiagent_orchestrator.py plan "implement A and fix B, review carefully"

# Apply veto rules
python config/harness/multiagent_orchestrator.py veto --verdicts '{"tester":{"verdict":"FAIL"}}' --cycle 1
```
