"""Implementer node — executes code in isolated worktrees via claude CLI"""
import json

from orchestrator.claude_runner import run_claude_sync
from orchestrator.context import load_context, update_section
from orchestrator.state import SharedState
from orchestrator.worktree_manager import cleanup_worktree, create_worktree

IMPLEMENTER_PROMPT = """你是实现者。执行以下任务：

任务描述：{description}
涉及的文件：{files}
架构决策：{decisions}
接口契约：{contracts}

在当前工作目录中实现代码。只修改你负责的文件。
完成后，简要描述你做了什么修改。

如果发现架构决策有问题（例如接口定义不合理），在输出开头写：
HANDOFF:architect:<原因>
然后停止实现。
"""


def implementer_node(state: SharedState) -> SharedState:
    """Execute implementation tasks in parallel worktrees"""
    tasks = state.get("tasks", [])
    ctx = load_context()
    decisions = ctx.get("decisions", [])
    contracts = ctx.get("api_contracts", [])

    implementer_tasks = [t for t in tasks if t.get("role") == "implementer"
                         and t.get("status") != "done"]

    for task in implementer_tasks:
        agent_id = f"impl-{tasks.index(task)}"
        try:
            wt = create_worktree(agent_id)
            task["worktree"] = wt
        except Exception:
            wt = None
            task["worktree"] = ""

        prompt = IMPLEMENTER_PROMPT.format(
            description=task.get("description", ""),
            files=", ".join(task.get("files", [])),
            decisions=json.dumps(decisions, ensure_ascii=False),
            contracts=json.dumps(contracts, ensure_ascii=False),
        )

        output = run_claude_sync(prompt, worktree=wt)
        task["output"] = output
        task["status"] = "done"

        # Check for handoff signal
        if output.strip().startswith("HANDOFF:architect:"):
            reason = output.split("HANDOFF:architect:", 1)[1].strip().split("\n")[0]
            state["handoff"] = {
                "from_role": "implementer",
                "to_role": "architect",
                "reason": reason,
            }
            break

        # Update shared context progress
        update_section("progress", {
            **ctx.get("progress", {}),
            agent_id: {"status": "done", "files_modified": task.get("files", [])},
        })

    return state
