"""Aggregator node — merges worktrees, summarizes results"""
from orchestrator.state import SharedState
from orchestrator.worktree_manager import cleanup_worktree, merge_worktree


def aggregator_node(state: SharedState) -> SharedState:
    """Merge all implementer worktrees back and summarize"""
    tasks = state.get("tasks", [])
    merged = []
    errors = []

    for i, task in enumerate(tasks):
        if task.get("role") == "implementer" and task.get("worktree"):
            agent_id = f"impl-{i}"
            try:
                ok = merge_worktree(agent_id)
                if ok:
                    merged.append(agent_id)
                else:
                    errors.append(f"merge failed: {agent_id}")
            except Exception as e:
                errors.append(f"merge error: {agent_id}: {e}")
            finally:
                try:
                    cleanup_worktree(agent_id)
                except Exception:
                    pass

    # Build summary
    summaries = []
    for task in tasks:
        if task.get("output"):
            role = task.get("role", "unknown")
            desc = task.get("description", "")[:100]
            summaries.append(f"[{role}] {desc}: {task.get('status', 'unknown')}")

    state["_merge_result"] = {
        "merged": merged,
        "errors": errors,
        "summary": "\n".join(summaries),
    }
    return state
