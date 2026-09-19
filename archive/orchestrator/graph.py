"""LangGraph StateGraph — role-based multi-agent orchestration

Topology: linear DAG + conditional handoff
  ROUTER ──"single"──→ END
     └──"collaborative"──→ ARCHITECT → IMPLEMENTER → REVIEWER → TESTER → AGGREGATOR → FEEDBACK → END

  Handoff paths:
    REVIEWER → architect (interface mismatch)
    TESTER → implementer (test failure, max 3 loops)
"""
import argparse
import asyncio
import json
import sys
from typing import Literal

from langgraph.graph import StateGraph, END

from orchestrator.state import SharedState
from orchestrator.nodes.router import router_node, route_decision
from orchestrator.nodes.architect import architect_node
from orchestrator.nodes.implementer import implementer_node
from orchestrator.nodes.reviewer import reviewer_node, review_router
from orchestrator.nodes.tester import tester_node, test_router
from orchestrator.nodes.aggregator import aggregator_node
from orchestrator.nodes.feedback import feedback_node


def _handoff_or_implementer(state: SharedState) -> str:
    """After implementer: check handoff, else go to reviewer"""
    handoff = state.get("handoff")
    if handoff and handoff.get("to_role") == "architect":
        iteration = state.get("iteration", 0)
        if iteration < 3:
            state["iteration"] = iteration + 1
            state["handoff"] = None
            return "architect"
    return "reviewer"


def build_graph() -> StateGraph:
    graph = StateGraph(SharedState)

    # Nodes
    graph.add_node("router", router_node)
    graph.add_node("architect", architect_node)
    graph.add_node("implementer", implementer_node)
    graph.add_node("reviewer", reviewer_node)
    graph.add_node("tester", tester_node)
    graph.add_node("aggregator", aggregator_node)
    graph.add_node("feedback", feedback_node)

    # Edges
    graph.set_entry_point("router")

    # router → single (END) or collaborative (architect)
    graph.add_conditional_edges("router", route_decision, {
        "single": END,
        "collaborative": "architect",
    })

    # architect → implementer
    graph.add_edge("architect", "implementer")

    # implementer → reviewer (or handoff back to architect)
    graph.add_conditional_edges("implementer", _handoff_or_implementer, {
        "reviewer": "reviewer",
        "architect": "architect",
    })

    # reviewer → tester / architect / implementer
    graph.add_conditional_edges("reviewer", review_router, {
        "tester": "tester",
        "architect": "architect",
        "implementer": "implementer",
    })

    # tester → aggregator (pass) / implementer (fail, max 3)
    graph.add_conditional_edges("tester", test_router, {
        "aggregator": "aggregator",
        "implementer": "implementer",
    })

    # aggregator → feedback → END
    graph.add_edge("aggregator", "feedback")
    graph.add_edge("feedback", END)

    return graph


# Compiled app singleton
app = build_graph().compile()


def run(prompt: str, **kwargs) -> dict:
    """Run the orchestrator graph with a user prompt"""
    initial_state: SharedState = {
        "messages": [{"role": "user", "content": prompt}],
        "routing_decision": "single",
        "tasks": [],
        "shared_context": {},
        "feedback_events": [],
        "handoff": None,
        "iteration": 0,
    }
    result = app.invoke(initial_state)
    return dict(result)


def main():
    parser = argparse.ArgumentParser(description="LangGraph multi-agent orchestrator")
    parser.add_argument("--input-json", action="store_true",
                        help="Read input from stdin as JSON")
    parser.add_argument("--prompt", type=str, help="Direct prompt text")
    args = parser.parse_args()

    if args.input_json:
        data = json.loads(sys.stdin.read())
        prompt = data.get("prompt", "")
    elif args.prompt:
        prompt = args.prompt
    else:
        prompt = sys.stdin.read().strip()

    if not prompt:
        print("No prompt provided", file=sys.stderr)
        sys.exit(1)

    result = run(prompt)
    # Output hook-compatible JSON
    merge_info = result.get("_merge_result", {})
    summary = merge_info.get("summary", "") if merge_info else ""

    if result.get("routing_decision") == "single":
        out = {"continue": True, "suppressOutput": True}
    else:
        suggestion = f"[LangGraph Orchestrator] Multi-agent workflow completed.\n{summary}"
        out = {
            "continue": True,
            "suppressOutput": True,
            "hookSpecificOutput": {
                "hookEventName": "UserPromptSubmit",
                "additionalContext": suggestion,
            },
        }
    print(json.dumps(out, ensure_ascii=False))


if __name__ == "__main__":
    main()
