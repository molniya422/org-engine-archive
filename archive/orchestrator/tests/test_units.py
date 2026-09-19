"""Tests for the orchestrator package"""
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch, MagicMock

# Add parent to path for imports
sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))


class TestRouter(unittest.TestCase):
    """Test the two-phase scoring router"""

    def test_strong_keyword(self):
        from orchestrator.nodes.router import phase1_score
        score, reasons = phase1_score("fix A and implement B using parallel agents", "fix a and implement b using parallel agents")
        self.assertIn("strong_keyword", reasons)
        self.assertGreaterEqual(score, 3)

    def test_greeting_penalty(self):
        from orchestrator.nodes.router import phase1_score
        score, reasons = phase1_score("你好", "你好")
        self.assertIn("greeting", reasons)
        self.assertLessEqual(score, -2)

    def test_short_penalty(self):
        from orchestrator.nodes.router import phase1_score
        score, reasons = phase1_score("ok", "ok")
        self.assertIn("short", reasons)
        self.assertLessEqual(score, -3)

    def test_moderate_keyword(self):
        from orchestrator.nodes.router import phase1_score
        score, reasons = phase1_score(
            "please fix the login bug and refactor the auth module",
            "please fix the login bug and refactor the auth module"
        )
        self.assertIn("moderate_keyword", reasons)
        self.assertGreaterEqual(score, 1)

    def test_phase2_multi_verb(self):
        from orchestrator.nodes.router import phase2_heuristic
        score, reasons = phase2_heuristic(
            "fix the bug and implement the feature",
            "fix the bug and implement the feature",
            2, ["moderate_keyword"]
        )
        self.assertIn("multi_verb", reasons)
        self.assertGreaterEqual(score, 3)

    def test_force_trigger(self):
        from orchestrator.nodes.router import is_force_trigger
        self.assertIsNotNone(is_force_trigger("并行执行这些任务"))
        self.assertIsNone(is_force_trigger("hello"))

    def test_route_decision_collaborative(self):
        from orchestrator.nodes.router import route_decision
        state = {"messages": [{"role": "user", "content": "并行执行 fix A 和 implement B"}]}
        result = route_decision(state)
        self.assertEqual(result, "collaborative")

    def test_route_decision_single(self):
        from orchestrator.nodes.router import route_decision
        state = {"messages": [{"role": "user", "content": "你好"}]}
        result = route_decision(state)
        self.assertEqual(result, "single")


class TestContext(unittest.TestCase):
    """Test shared context file read/write"""

    def setUp(self):
        self.tmpdir = tempfile.mkdtemp()
        tmp_path = Path(self.tmpdir) / "shared_context.json"
        self.patcher = patch("orchestrator.context._CONTEXT_FILE", tmp_path)
        self.patcher.start()

    def tearDown(self):
        self.patcher.stop()
        import shutil
        shutil.rmtree(self.tmpdir, ignore_errors=True)

    def test_load_empty(self):
        from orchestrator.context import load_context, save_context, _empty_context
        save_context(_empty_context())
        ctx = load_context()
        self.assertEqual(ctx["decisions"], [])

    def test_save_and_load(self):
        from orchestrator.context import load_context, save_context
        save_context({"decisions": ["use REST API"], "api_contracts": [], "progress": {}, "messages": []})
        ctx = load_context()
        self.assertEqual(ctx["decisions"], ["use REST API"])

    def test_update_section(self):
        from orchestrator.context import load_context, update_section
        update_section("decisions", ["use GraphQL"])
        ctx = load_context()
        self.assertEqual(ctx["decisions"], ["use GraphQL"])


class TestState(unittest.TestCase):
    """Test SharedState TypedDict"""

    def test_state_creation(self):
        from orchestrator.state import SharedState
        state: SharedState = {
            "messages": [],
            "routing_decision": "single",
            "tasks": [],
            "iteration": 0,
        }
        self.assertEqual(state["routing_decision"], "single")


class TestFeedback(unittest.TestCase):
    """Test feedback node writing"""

    def test_feedback_types(self):
        from orchestrator.nodes.feedback import feedback_node
        # Just verify the function exists and has correct signature
        self.assertTrue(callable(feedback_node))


if __name__ == "__main__":
    unittest.main()
