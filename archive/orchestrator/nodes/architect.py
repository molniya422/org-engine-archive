"""Architect node — analyzes task, splits into subtasks, defines contracts"""
from orchestrator.claude_runner import run_claude_sync
from orchestrator.context import clear_context, load_context, save_context
from orchestrator.state import SharedState

ARCHITECT_PROMPT = """你是架构师。分析以下用户需求，将复杂任务拆分为子任务。

对于每个子任务，定义：
1. role: implementer / tester / reviewer
2. description: 具体做什么
3. files: 涉及的文件路径列表

将结果以 JSON 格式输出，结构如下：
```json
{{
  "decisions": ["架构决策1", "架构决策2"],
  "api_contracts": ["接口定义1"],
  "tasks": [
    {{"role": "implementer", "description": "...", "files": ["..."]}},
    {{"role": "implementer", "description": "...", "files": ["..."]}},
    {{"role": "reviewer", "description": "...", "files": ["..."]}},
    {{"role": "tester", "description": "...", "files": ["..."]}}
  ]
}}
```

用户需求：{prompt}
"""


def architect_node(state: SharedState) -> SharedState:
    """Analyze task, create subtask plan, write to shared context"""
    clear_context()
    msgs = state.get("messages", [])
    prompt = msgs[-1].get("content", "") if msgs else ""
    if not prompt:
        prompt = str(msgs[-1]) if msgs else ""

    result_text = run_claude_sync(ARCHITECT_PROMPT.format(prompt=prompt[:2000]))

    # Parse JSON from claude output
    import json
    import re
    plan = None
    json_match = re.search(r"```json\s*(.*?)\s*```", result_text, re.DOTALL)
    if json_match:
        try:
            plan = json.loads(json_match.group(1))
        except json.JSONDecodeError:
            pass
    if plan is None:
        # Fallback: try parsing the entire output as JSON
        stripped = result_text.strip()
        if stripped.startswith("{") and stripped.endswith("}"):
            try:
                plan = json.loads(stripped)
            except json.JSONDecodeError:
                pass

    if plan:
        ctx = load_context()
        ctx["decisions"] = plan.get("decisions", [])
        ctx["api_contracts"] = plan.get("api_contracts", [])
        save_context(ctx)

        tasks = []
        for i, t in enumerate(plan.get("tasks", [])):
            tasks.append({
                "role": t.get("role", "implementer"),
                "description": t.get("description", ""),
                "files": t.get("files", []),
                "status": "pending",
                "output": "",
                "worktree": "",
            })
        state["tasks"] = tasks
    else:
        state["tasks"] = [{"role": "implementer", "description": prompt,
                            "files": [], "status": "pending", "output": "",
                            "worktree": ""}]

    state["iteration"] = state.get("iteration", 0)
    state["handoff"] = None
    return state
