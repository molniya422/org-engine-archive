"""End-to-end test for the LangGraph orchestrator

Tests individual nodes and routing in isolation (fast),
plus a graph topology check (no actual execution).
"""
import json
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from orchestrator.graph import build_graph
from orchestrator.state import SharedState

# Fake architect plan returned by mock
_FAKE_PLAN = json.dumps({
    "decisions": ["decision1"],
    "api_contracts": ["contractA"],
    "tasks": [
        {"role": "implementer", "description": "fix A", "files": ["a.py"]},
        {"role": "implementer", "description": "refactor B", "files": ["b.py"]},
    ],
}, ensure_ascii=False)


class TestGraphTopology(unittest.TestCase):
    """Verify the graph compiles and has correct node/edge structure"""

    def test_graph_compiles(self):
        graph = build_graph()
        self.assertIsNotNone(graph)

    def test_graph_has_all_nodes(self):
        from orchestrator.graph import app
        # LangGraph stores nodes in the compiled graph
        node_names = set(app.get_graph().nodes.keys())
        for expected in ("router", "architect", "implementer", "reviewer",
                         "tester", "aggregator", "feedback"):
            self.assertIn(expected, node_names,
                          f"Missing node: {expected}. Got: {node_names}")


class TestArchitectNode(unittest.TestCase):
    """Test architect node JSON parsing"""

    def test_plain_json_output(self):
        from orchestrator.nodes.architect import architect_node
        with patch("orchestrator.nodes.architect.run_claude_sync",
                   return_value=_FAKE_PLAN):
            state = _base_state()
            new_state = architect_node(state)
        tasks = new_state.get("tasks", [])
        self.assertEqual(len(tasks), 2)
        self.assertEqual(tasks[0]["role"], "implementer")
        self.assertEqual(tasks[0]["description"], "fix A")

    def test_json_in_code_block(self):
        from orchestrator.nodes.architect import architect_node
        with patch("orchestrator.nodes.architect.run_claude_sync",
                   return_value=f"Plan:\n```json\n{_FAKE_PLAN}\n```"):
            state = _base_state()
            new_state = architect_node(state)
        tasks = new_state.get("tasks", [])
        self.assertEqual(len(tasks), 2)

    def test_invalid_json_fallback(self):
        from orchestrator.nodes.architect import architect_node
        with patch("orchestrator.nodes.architect.run_claude_sync",
                   return_value="I don't understand"):
            state = _base_state()
            new_state = architect_node(state)
        tasks = new_state.get("tasks", [])
        # Falls back to single implementer task
        self.assertEqual(len(tasks), 1)
        self.assertEqual(tasks[0]["role"], "implementer")


class TestImplementerNode(unittest.TestCase):

    def test_implementer_marks_done(self):
        from orchestrator.nodes.implementer import implementer_node
        with patch("orchestrator.nodes.implementer.run_claude_sync",
                   return_value="Done: code."):
            with patch("orchestrator.nodes.implementer.update_section"):
                with patch("orchestrator.worktree_manager.create_worktree",
                           return_value="/tmp/wt"):
                    state = _base_state()
                    state["tasks"] = [{"role": "implementer", "description": "fix A",
                                        "files": ["a.py"], "status": "pending",
                                        "output": "", "worktree": ""}]
                    new_state = implementer_node(state)
        self.assertEqual(new_state["tasks"][0]["status"], "done")

    def test_implementer_handoff(self):
        from orchestrator.nodes.implementer import implementer_node
        with patch("orchestrator.nodes.implementer.run_claude_sync",
                   return_value="HANDOFF:architect:bad interface"):
            with patch("orchestrator.nodes.implementer.update_section"):
                with patch("orchestrator.worktree_manager.create_worktree",
                           return_value="/tmp/wt"):
                    state = _base_state()
                    state["tasks"] = [{"role": "implementer", "description": "fix A",
                                        "files": ["a.py"], "status": "pending",
                                        "output": "", "worktree": ""}]
                    new_state = implementer_node(state)
        self.assertIsNotNone(new_state.get("handoff"))
        self.assertEqual(new_state["handoff"]["to_role"], "architect")


class TestReviewerNode(unittest.TestCase):

    def test_approved(self):
        from orchestrator.nodes.reviewer import reviewer_node
        with patch("orchestrator.nodes.reviewer.run_claude_sync",
                   return_value="APPROVED"):
            state = _base_state()
            state["tasks"] = [_done_impl_task()]
            new_state = reviewer_node(state)
        self.assertEqual(new_state["_review_status"], "approved")

    def test_blocked(self):
        from orchestrator.nodes.reviewer import reviewer_node
        with patch("orchestrator.nodes.reviewer.run_claude_sync",
                   return_value="BLOCKED: security issue"):
            state = _base_state()
            state["tasks"] = [_done_impl_task()]
            new_state = reviewer_node(state)
        self.assertEqual(new_state["_review_status"], "blocked")

    def test_handoff_to_architect(self):
        from orchestrator.nodes.reviewer import reviewer_node
        with patch("orchestrator.nodes.reviewer.run_claude_sync",
                   return_value="HANDOFF:architect:API contract mismatch"):
            state = _base_state()
            state["tasks"] = [_done_impl_task()]
            new_state = reviewer_node(state)
        self.assertEqual(new_state["handoff"]["to_role"], "architect")


class TestTesterNode(unittest.TestCase):

    def test_pass(self):
        from orchestrator.nodes.tester import tester_node
        with patch("orchestrator.nodes.tester.run_claude_sync",
                   return_value="PASS: all tests passed"):
            state = _base_state()
            state["tasks"] = [_done_impl_task()]
            new_state = tester_node(state)
        self.assertEqual(new_state["_test_result"], "pass")

    def test_fail(self):
        from orchestrator.nodes.tester import tester_node
        with patch("orchestrator.nodes.tester.run_claude_sync",
                   return_value="FAIL: test_login failed"):
            state = _base_state()
            state["tasks"] = [_done_impl_task()]
            new_state = tester_node(state)
        self.assertEqual(new_state["_test_result"], "fail")


class TestRouters(unittest.TestCase):

    def test_handoff_or_implementer_reviewer(self):
        from orchestrator.graph import _handoff_or_implementer
        state = _base_state()
        self.assertEqual(_handoff_or_implementer(state), "reviewer")

    def test_handoff_or_implementer_architect(self):
        from orchestrator.graph import _handoff_or_implementer
        state = _base_state()
        state["handoff"] = {"from_role": "implementer", "to_role": "architect",
                            "reason": "bad api"}
        self.assertEqual(_handoff_or_implementer(state), "architect")
        # Iteration was incremented
        self.assertEqual(state["iteration"], 1)

    def test_review_router_approved(self):
        from orchestrator.nodes.reviewer import review_router
        state = _base_state()
        state["_review_status"] = "approved"
        self.assertEqual(review_router(state), "tester")

    def test_review_router_blocked(self):
        from orchestrator.nodes.reviewer import review_router
        state = _base_state()
        state["_review_status"] = "blocked"
        self.assertEqual(review_router(state), "architect")

    def test_review_router_handoff(self):
        from orchestrator.nodes.reviewer import review_router
        state = _base_state()
        state["handoff"] = {"from_role": "reviewer", "to_role": "architect",
                            "reason": "api mismatch"}
        self.assertEqual(review_router(state), "architect")

    def test_test_router_pass(self):
        from orchestrator.nodes.tester import test_router
        state = _base_state()
        state["_test_result"] = "pass"
        self.assertEqual(test_router(state), "aggregator")

    def test_test_router_fail(self):
        from orchestrator.nodes.tester import test_router
        state = _base_state()
        state["_test_result"] = "fail"
        self.assertEqual(test_router(state), "implementer")
        self.assertEqual(state["iteration"], 1)

    def test_test_router_fail_max_iterations(self):
        from orchestrator.nodes.tester import test_router
        state = _base_state()
        state["_test_result"] = "fail"
        state["iteration"] = 3
        self.assertEqual(test_router(state), "aggregator")

    def test_route_decision_single(self):
        from orchestrator.nodes.router import route_decision
        state = {"messages": [{"role": "user", "content": "hi"}]}
        self.assertEqual(route_decision(state), "single")

    def test_route_decision_collaborative(self):
        from orchestrator.nodes.router import route_decision
        state = {"messages": [{"role": "user", "content": "并行执行 fix A 和 implement B"}]}
        self.assertEqual(route_decision(state), "collaborative")


class TestFeedbackNode(unittest.TestCase):

    def test_feedback_tp(self):
        from orchestrator.nodes.feedback import feedback_node
        state = _base_state()
        state["routing_decision"] = "collaborative"
        state["tasks"] = [
            {"role": "implementer", "description": "fix A", "files": [],
             "status": "done", "worktree": ""},
            {"role": "tester", "description": "run tests", "files": [],
             "status": "done", "worktree": ""},
        ]
        result = feedback_node(state)
        self.assertIsNotNone(result)

    def test_feedback_fn(self):
        from orchestrator.nodes.feedback import feedback_node
        state = _base_state()
        state["routing_decision"] = "single"
        result = feedback_node(state)
        self.assertIsNotNone(result)


# Helpers

def _base_state() -> SharedState:
    return SharedState(
        messages=[{"role": "user", "content": "test prompt"}],
        routing_decision="collaborative",
        tasks=[],
        shared_context={},
        feedback_events=[],
        handoff=None,
        iteration=0,
    )


def _done_impl_task() -> dict:
    return {"role": "implementer", "description": "fix A", "files": ["a.py"],
            "status": "done", "output": "Done: implemented.", "worktree": ""}


if __name__ == "__main__":
    unittest.main()
