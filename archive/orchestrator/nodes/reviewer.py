"""Reviewer node — reviews implementer's changes against architecture decisions"""
from orchestrator.claude_runner import run_claude_sync
from orchestrator.context import load_context
from orchestrator.state import SharedState

REVIEWER_PROMPT = """你是代码审查者。检查以下实现是否符合架构决策和接口契约。

架构决策：{decisions}
接口契约：{contracts}
实现者产出的文件：{files}
实现者输出摘要：{output}

审查结果用以下格式输出：
- APPROVED: 通过审查
- CONCERNS: <问题列表>
- BLOCKED: <阻塞原因>

如果接口契约本身有问题，在输出开头写：
HANDOFF:architect:<原因>
"""


def reviewer_node(state: SharedState) -> SharedState:
    tasks = state.get("tasks", [])
    ctx = load_context()
    decisions = ctx.get("decisions", [])
    contracts = ctx.get("api_contracts", [])

    impl_tasks = [t for t in tasks if t.get("role") == "implementer" and t.get("output")]
    if not impl_tasks:
        state["_review_status"] = "approved"
        return state

    files = []
    output_parts = []
    for t in impl_tasks:
        files.extend(t.get("files", []))
        output_parts.append(t.get("output", "")[:500])

    prompt = REVIEWER_PROMPT.format(
        decisions=str(decisions),
        contracts=str(contracts),
        files=", ".join(files),
        output="\n---\n".join(output_parts),
    )

    result = run_claude_sync(prompt)
    state["_review_result"] = result

    # Check for handoff
    if result.strip().startswith("HANDOFF:architect:"):
        reason = result.split("HANDOFF:architect:", 1)[1].strip().split("\n")[0]
        state["handoff"] = {
            "from_role": "reviewer",
            "to_role": "architect",
            "reason": reason,
        }
        state["_review_status"] = "approved"  # handoff takes precedence
    elif result.strip().startswith("APPROVED"):
        state["_review_status"] = "approved"
    elif result.strip().startswith("BLOCKED"):
        state["_review_status"] = "blocked"
    else:
        state["_review_status"] = "approved"  # default: don't loop forever

    return state


def review_router(state: SharedState) -> str:
    """Route after review: approved→tester, handoff→architect, concerns→implementer"""
    handoff = state.get("handoff")
    if handoff and handoff.get("to_role") == "architect":
        iteration = state.get("iteration", 0)
        if iteration < 3:
            return "architect"
        return "tester"

    status = state.get("_review_status", "approved")
    if status == "approved":
        return "tester"
    if status == "blocked":
        return "architect"
    return "implementer"
