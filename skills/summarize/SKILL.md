---
name: summarize
description: Use when user types /summarize - force a structured end-of-session summary covering (1) reusable lessons worth writing to memory/ and (2) SkillOpt trigger review for this session
---

# Summarize — Force Post-Task Summary

Triggered explicitly via `/summarize` or automatically by `post-task-detect.sh` when the user signals completion. Produces a structured summary covering two distinct concerns that the user must explicitly decide on.

## When Invoked

Walk through the entire session chronologically and produce TWO sections. Do not skip either.

### Section A: Reusable Lessons for memory/

For each candidate lesson, ask: **will this help a future session do better work?** If yes, propose a memory entry.

| Write to memory | Skip |
|---|---|
| Architecture decisions (why X over Y) | Obvious bug fixes |
| Tool/library pitfalls (e.g., "X needs flag Y on Windows") | One-off operations |
| Non-obvious config or env quirks | Info already in code/git |
| Recurring patterns across sessions | Trivial changes |
| CLAUDE.md rule gaps you discovered | Single-task workarounds |

Format for each memory entry (the AI then writes the actual file):
```
title: <concise name>
type: feedback | project
filename: <kebab-case.md>
content: <3-10 sentences>
tags: [relevant, tags]
```

After listing candidates, **ask the user** which ones to actually write. Don't write without confirmation.

### Section B: SkillOpt Trigger Review

Review this session's skill triggers:
- **Misses** (should have triggered, didn't): which skill should have fired and on what task?
- **False positives** (fired but unnecessary): which skill was irrelevant?

If any are found, write them to `D:/claude-ecosystem/config/skill-feedback/feedback.md` in this format:
```
## YYYY-MM-DD - <short title>

### 漏报（该触发没触发）
- 任务: (what was happening)
- 应该触发: <skill-name>
- 原因: (why it was missed)

### 误报（触发了但不合适）  ← only if any
- 任务: (what was happening)
- 误触发: <skill-name>
- 问题: (why it was wrong)
```

Then run `D:/claude-ecosystem/config/harness/skillopt-collect.sh` to sync meta.json.

## Iron Rule

**Do not invent lessons.** If nothing in the session meets the bar above, say "no actionable lessons" and stop. Padding the summary with trivia is worse than no summary.

## Backfill Mode (`/summarize --backfill`)

Fallback catch-up when previous sessions were not auto-summarized (harness hooks were not wired before heavy mode v2). Two sub-modes:

### --backfill recent (default)
Walk the last 3-5 claude-mem observations from this project, or the most recent git commits, to identify unsummarized work:

1. Search mem-search-lite: `search(query="claude-ecosystem", project="claude-ecosystem", limit=10)`
2. For each observation that looks like a completed task without a memory entry, extract the reusable lesson
3. Apply the Section A criteria — do NOT backfill trivial bug fixes or one-off operations
4. List candidates and ask the user before writing memory files

### --backfill N
Same as above but walk the last N observations or commits.

### --backfill <date>
Backfill everything from that date to now.

### --backfill topic <keyword>
Search claude-mem and git log for a specific topic (e.g., "MCP", "hook", "encoding") and backfill whatever wasn't summarized.

In all modes, mark backfilled memories with metadata tag `backfill: true`.
