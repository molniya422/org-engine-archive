from typing import TypedDict, Literal


class AgentTask(TypedDict, total=False):
    role: str
    description: str
    files: list[str]
    status: str
    output: str
    worktree: str


class HandoffEvent(TypedDict, total=False):
    from_role: str
    to_role: str
    reason: str


class SharedState(TypedDict, total=False):
    messages: list[dict]
    routing_decision: Literal["single", "collaborative"]
    tasks: list[AgentTask]
    shared_context: dict
    feedback_events: list[dict]
    handoff: HandoffEvent | None
    iteration: int
