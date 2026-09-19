---
name: task-parallel
description: "Multi-task parallel execution mode. Automatically decomposes tasks into independent subtasks, dispatches one implementer per subtask in parallel, then integrates results."
effort: high
tags: [loop-engineering, multi-agent, parallel-execution, task-decomposition]
---

# Task-Parallel — Multi-Task Parallel Execution

You are a **task-parallel** orchestrator. You decompose the user's request into independent subtasks, dispatch one implementer agent per subtask in parallel, then integrate all results.

**This is the V2 orchestrator's `task_parallel` mode.** The orchestrator auto-detects multi-task prompts and selects this mode. You can also invoke it directly with `/task-parallel`.

## When to Use

- User says "task-parallel" or "/task-parallel"
- User has 2+ independent tasks that can run concurrently
- No shared state or sequential dependencies between tasks
- Examples: "Fix A and refactor B", "实现认证模块，同时修复CSS样式"

**Don't use when:**
- Tasks are tightly coupled (fix one changes another)
- Need quality review per subtask (use `/hybrid-orchestrator` instead)
- Single task needing multiple perspectives (use `/role-collab` instead)

## Orchestration Flow

### Phase 1: PARALLEL_EXECUTE

1. Analyze the user's request and decompose into independent subtasks
2. For each subtask, dispatch a **separate agent** in parallel:

```
Agent 1 → Implement subtask 1
Agent 2 → Implement subtask 2
Agent N → Implement subtask N
```

Each agent gets:
- **Specific scope:** One subtask only
- **Clear goal:** What to implement/fix
- **Constraints:** Do not modify files owned by other subtasks
- **Expected output:** Summary of changes made

**All agents dispatch in a single message** (multiple Agent tool calls at once).

### Phase 2: INTEGRATE

After all agents complete:
1. Collect all results
2. Verify no conflicts between agent changes
3. Run full test suite
4. Dispatch an **Integrator** agent if results are complex to merge

## Prompt Template for Implementer Agents

```
You are an IMPLEMENTER for subtask [{subtask_id}].

**Task:** {task_description}
**Scope:** Only modify files related to this subtask. Do not touch files outside your scope.
**Goal:** Implement the described functionality completely.

After completing:
- List all files you modified
- Summarize what you implemented
- Note any issues or concerns

Return: DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED
```

## Prompt Template for Integrator Agent

```
You are an INTEGRATOR. Multiple implementer agents have completed parallel subtasks.

Review their outputs:
{agent_outputs}

Your task:
1. Verify no conflicting changes between agents
2. If conflicts exist, resolve them
3. Run the full test suite
4. Report final status

Return: INTEGRATED / CONFLICTS_FOUND
```

## Conflict Resolution

| Conflict Type | Resolution |
|---|---|
| Same file edited by 2+ agents | Integrator merges changes |
| Import conflicts | Integrator resolves import order |
| Test failures after merge | Escalate to user |

## Example

User: "实现用户认证模块，同时修复登录页面的CSS样式问题"

```
# Phase 1: PARALLEL_EXECUTE
Agent(implementer, task="实现用户认证模块", scope="auth/*, middleware/*")
Agent(implementer, task="修复登录页面CSS样式问题", scope="styles/*, components/Login.css")

# Phase 2: INTEGRATE
Agent(integrator, review both outputs, verify no conflicts)
```

## Level Progression

| Level | Behavior |
|-------|----------|
| L1 | Show decomposition plan, no agent dispatch |
| L2 | Execute with human gate after integration |
| L3 | Full auto-execute with auto-integration |

## CLI

```bash
# Plan mode (L1)
python config/harness/multiagent_orchestrator.py plan "task A and task B"

# View available roles
python config/harness/multiagent_orchestrator.py roles
```
