---
name: skillopt
description: Use when user types /skillopt - force a focused review of skill trigger accuracy for the current session, then write any misses/false-positives to feedback.md
---

# SkillOpt — Force Trigger Accuracy Review

Triggered explicitly via `/skillopt` or as part of the post-task hook. Reviews which skills fired (or should have fired) in the current session and records signals for threshold-based CLAUDE.md optimization.

## When Invoked

### Phase 1: Trace

List every skill that was triggered this session (whether by user slash command, auto-suggestion, or hook). For each, note:
- **What task it fired on**
- **Whether it was the right call** (helped / neutral / wasted tokens)

### Phase 2: Find Misses

Walk through the session and ask: **at any moment, was a skill obviously needed that wasn't triggered?**

Common miss patterns:
- A bug appeared but `systematic-debugging` wasn't used
- A completion claim was made without `verification-before-completion`
- A new task was accepted without `brainstorming` or `making-a-plan`
- A refactor was proposed without checking tests / dependents
- A design decision was made without consulting existing patterns

### Phase 3: Find False Positives

Which skills fired but didn't actually help?
- Skills that were invoked but their advice wasn't applicable
- Skills whose preconditions weren't met (e.g., TDD on a non-test project)
- Skills triggered by surface keywords but not by real intent

### Phase 4: Record

If Phase 2 or 3 found anything, append to `D:/claude-ecosystem/config/skill-feedback/feedback.md`:

```
## YYYY-MM-DD - <short title>

### 漏报（该触发没触发）
- 任务: (description)
- 应该触发: <skill-name>
- 原因: (why)

### 误报（触发了但不合适）  ← only if any
- 任务: (description)
- 误触发: <skill-name>
- 问题: (why)
```

After writing, run:
```bash
D:/claude-ecosystem/config/harness/skillopt-collect.sh
```

This updates `meta.json` to keep the counter in sync with `feedback.md`.

### Phase 5: Check Threshold

Read `D:/claude-ecosystem/config/skill-feedback/meta.json`. If `total_feedback_entries >= threshold`:
- Remind the user that the optimization threshold has been reached
- Suggest reviewing CLAUDE.md §6 trigger rules
- After the user updates CLAUDE.md, set `last_optimized` to today's date in meta.json

## Iron Rule

**Empty sessions produce empty reviews.** If nothing fired and nothing was missed, output a single line: "No signal this session." and exit. Don't manufacture feedback.
