"""Tester node — runs tests and reports pass/fail"""
from orchestrator.claude_runner import run_claude_sync
from orchestrator.state import SharedState

TESTER_PROMPT = """你是测试者。对以下实现运行测试。

涉及的文件：{files}
实现者输出摘要：{output}

请运行相关的测试命令并报告结果。格式：
- PASS: <测试摘要>
- FAIL: <失败详情，供实现者修复>
"""


def tester_node(state: SharedState) -> SharedState:
    tasks = state.get("tasks", [])
    impl_tasks = [t for t in tasks if t.get("role") == "implementer" and t.get("output")]

    if not impl_tasks:
        state["_test_result"] = "pass"
        return state

    files = []
    output_parts = []
    for t in impl_tasks:
        files.extend(t.get("files", []))
        output_parts.append(t.get("output", "")[:500])

    prompt = TESTER_PROMPT.format(
        files=", ".join(files),
        output="\n---\n".join(output_parts),
    )

    result = run_claude_sync(prompt, timeout=300)
    state["_test_output"] = result

    if result.strip().startswith("PASS"):
        state["_test_result"] = "pass"
    else:
        state["_test_result"] = "fail"

    return state


def test_router(state: SharedState) -> str:
    """Route after test: pass→aggregator, fail→implementer (with iteration limit)"""
    if state.get("_test_result") == "pass":
        return "aggregator"
    iteration = state.get("iteration", 0)
    if iteration < 3:
        # Reset implementer tasks for rework
        for t in state.get("tasks", []):
            if t.get("role") == "implementer":
                t["status"] = "pending"
                t["output"] = ""
        state["iteration"] = iteration + 1  # Mutate state so next router sees incremented
        return "implementer"
    # Max iterations reached, move on
    return "aggregator"
