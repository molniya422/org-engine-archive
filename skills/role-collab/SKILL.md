---
name: role-collab
description: "Multi-role parallel agent collaboration with structured review loop. Dispatches Maker/Reviewer/Tester/Architect agents, collects verdicts, and applies veto rules at the DECISION gate."
effort: high
tags: [loop-engineering, multi-agent, role-collaboration, review-loop, parallel-gate]
---

## V2 Architecture

**This skill is now part of the unified Multi-Agent Orchestrator.** The orchestrator
provides three modes and dynamic role composition:

| Mode | When | Roles |
|------|------|-------|
| `role_collab` | Single task, needs review | Auto-selected from role-registry.yaml |
| `task_parallel` | Multiple independent tasks | Implementer per task + Integrator |
| `hybrid` | Multi-task + quality gates | Full review roster per task |

**Dynamic Roles:** Roles are no longer fixed to maker/reviewer/tester/architect.
The orchestrator analyzes the task and selects from: implementer, reviewer, tester,
architect, security_auditor, designer, integrator.

**To invoke directly:** Use `/role-collab` for the classic multi-role workflow.
For the new orchestrator, use the mode auto-detected by the UserPromptSubmit hook
or call: `python config/harness/multiagent_orchestrator.py plan "your task"`

## Classic Mode (V1 — still supported)

# Role-Collab — Parallel Gate Protocol

You are a role-collab orchestrator. You dispatch multiple agents in parallel, collect their verdicts, apply veto rules, and manage the review cycle.

## When to Use

- User says "role-collab" or "/role-collab"
- User asks for multi-agent review with different roles
- Task is complex enough to benefit from parallel perspectives (implementation + review + testing + architecture)
- The multiagent-detect hook suggests role-collab

## invocation

```bash
# L1: Propose-only (no agents dispatched)
python config/harness/role-collab-runner.py run --task "description" --level L1

# L2: Full execution with human gate at DECISION
python config/harness/role-collab-runner.py run --task "description" --level L2

# Review phase (after Maker completes)
python config/harness/role-collab-runner.py review --task-id <id> --maker-output "<output>"

# Decision phase (after all verdicts collected)
python config/harness/role-collab-runner.py decide --task-id <id> \
  --reviewer-verdict '{"verdict":"APPROVE","issues":[],"summary":"..."}' \
  --tester-verdict '{"verdict":"PASS","test_results":"...","failures":[]}' \
  --architect-verdict '{"verdict":"SAFE","concerns":[],"impact_scope":"..."}'

# Check status
python config/harness/role-collab-runner.py status

# Dry run
python config/harness/role-collab-runner.py run --task "description" --dry-run
```

## Orchestration Flow

### Phase 1: IMPLEMENT

1. Parse the user's task description
2. Dispatch a **Maker** agent (subagent_type: "claude") with the implementation prompt
3. Wait for Maker to complete

### Phase 2: PARALLEL REVIEW

Dispatch 3 agents **in parallel** (single message, multiple Agent tool calls):

| Agent | Role | Instruction |
|-------|------|-------------|
| Agent 1 | Reviewer | "You are the REVIEWER. Review this code for correctness, style, security." |
| Agent 2 | Tester | "You are the TESTER. Run tests on this code. Write tests if none exist." |
| Agent 3 | Architect | "You are the ARCHITECT. Check architectural compliance and cross-file impact." |

Each agent returns a structured verdict JSON.

### Phase 3: DECISION

Collect all 3 verdicts and apply veto rules:

| Rule | Condition | Action |
|------|-----------|--------|
| Tester veto | verdict = FAIL | REJECT (mandatory fix) |
| Architect risk | verdict = RISK | ESCALATE to human |
| Reviewer changes | verdict = REQUEST_CHANGES | REVISE (re-dispatch Maker) |
| 2+ consecutive vetoes | across cycles | ESCALATE to human |
| Max cycles hit | cycle >= 3 | ESCALATE to human |
| All approve | all verdicts pass | ACCEPT (L2: pending human confirmation) |

### Review Cycle

If decision is "revise", increment cycle counter and return to Phase 1 with the reviewer's feedback as additional context for Maker.

## State Tracking

All state is managed by `role-collab-runner.py` and stored in:
- `config/loop-engineering/states/role-collab.json` — active tasks, verdicts, cycles
- `config/loop-engineering/run-log.jsonl` — append-only audit trail
- `config/loop-engineering/budget.json` — token usage tracking

## Safety

- Maker and Reviewer must be **different agent instances** (never same agent reviewing own code)
- Architecture RISK verdicts always require human approval
- Path denylist from `safety.md` is enforced
- Budget kill switch at 100% daily cap
- Max 3 review cycles before mandatory escalation

## Level Progression

| Level | Behavior |
|-------|----------|
| L1 | Propose-only: show plan, no agent dispatch |
| L2 | Execute with human gate at DECISION phase |
| L3 | Full auto-decide (accept/reject without human) |
