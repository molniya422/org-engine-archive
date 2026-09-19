"""Feedback node — records TP/FP/FN to training-loop/feedback.md"""
from datetime import datetime, timezone

from orchestrator.config import get_feedback_path
from orchestrator.state import SharedState


def feedback_node(state: SharedState) -> SharedState:
    """Record dispatch quality feedback to feedback.md"""
    decision = state.get("routing_decision", "single")
    tasks = state.get("tasks", [])
    events = state.get("feedback_events", [])

    # Determine feedback type
    # router said collaborative AND multi-role tasks were actually executed → TP
    # router said collaborative BUT only 1 agent was needed → FP
    # router said single BUT user later indicated multi-agent was needed → FN
    impl_count = sum(1 for t in tasks if t.get("role") == "implementer")
    has_multiple_roles = len(set(t.get("role") for t in tasks)) >= 2

    if decision == "collaborative":
        if has_multiple_roles and impl_count >= 1:
            event_type = "Correct Trigger"
            event_detail = f"collaborative dispatch: {len(tasks)} tasks, {impl_count} implementers"
        else:
            event_type = "False Positive"
            event_detail = "collaborative dispatch but single-agent would suffice"
    else:
        event_type = "Miss"
        event_detail = "single dispatch but multi-agent may have been better"

    # Add any events from graph execution
    all_events = [{"type": event_type, "detail": event_detail}] + events

    # Write to feedback.md
    feedback_path = get_feedback_path()
    if feedback_path.exists():
        content = feedback_path.read_text(encoding="utf-8")
    else:
        content = ""

    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    lines = []
    for e in all_events:
        lines.append(f"\n### {e['type']}")
        lines.append(f"  - [{timestamp}] {e['detail']}")

    # Append to MultiAgentOpt section
    marker = "## MultiAgentOpt"
    if marker in content:
        lines_text = "\n".join(lines)
        # Insert after the heading line's end-of-line, before any sub-sections
        idx = content.find(marker)
        end_of_heading = content.find("\n", idx)
        if end_of_heading == -1:
            end_of_heading = len(content)
        content = content[:end_of_heading + 1] + lines_text + content[end_of_heading + 1:]
        feedback_path.write_text(content, encoding="utf-8")
    else:
        with open(feedback_path, "a", encoding="utf-8") as f:
            f.write(f"\n{marker}\n" + "\n".join(lines) + "\n")

    return state
