"""P4.2 tests — execution router.

验收：相同输入在相同版本下路由稳定，可解释且可回放。
- simple: 一个模型即可（低复杂度、低风险、少量工具）。
- review: 需要候选 + 审查（有高风险动作或证据不足）。
- parallel: 映射到 multiagent_orchestrator（多工具/多步骤协作）。
- 每种路由都保存选择原因（可回放）。
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from personal.execution_router import (
    ROUTER_VERSION,
    RouteKind,
    RouteDecision,
    route,
)
from personal.decision_types import CandidateAction


def simple_task() -> dict:
    return {
        "task_id": "task_s",
        "complexity": 1,          # 1-5
        "evidence_count": 3,
        "risk_level": "low",
        "tool_count": 1,
    }


class TestExecutionRouter(unittest.TestCase):
    def test_low_complexity_low_risk_routes_simple(self):
        d = route(simple_task())
        self.assertEqual(d.route, "simple")
        self.assertEqual(d.reason["version"], ROUTER_VERSION)

    def test_high_risk_routes_review(self):
        d = route({**simple_task(), "risk_level": "high"})
        self.assertEqual(d.route, "review")
        self.assertIn("risk=high", d.reason["factors"])

    def test_many_tools_route_parallel(self):
        d = route({**simple_task(), "tool_count": 4, "complexity": 4})
        self.assertEqual(d.route, "parallel")

    def test_parallel_maps_to_multiagent_orchestrator(self):
        d = route({**simple_task(), "tool_count": 4, "complexity": 4})
        self.assertEqual(d.reason["executor"], "multiagent_orchestrator")

    def test_review_when_evidence_thin(self):
        d = route({**simple_task(), "evidence_count": 0})
        self.assertEqual(d.route, "review")
        self.assertIn("evidence=0", d.reason["factors"])

    def test_priority_parallel_over_review_over_simple(self):
        """同时满足多条时取更重的路由。"""
        d = route({**simple_task(), "risk_level": "high", "tool_count": 4,
                   "complexity": 4, "evidence_count": 0})
        self.assertEqual(d.route, "parallel")

    def test_same_input_same_version_stable_route(self):
        """可回放：同一输入 + 同一 ROUTER_VERSION → 完全相同的决策。"""
        task = {**simple_task(), "risk_level": "medium", "tool_count": 2}
        d1, d2 = route(task), route(task)
        self.assertEqual(d1, d2)

    def test_reason_is_recorded_for_replay(self):
        d = route(simple_task())
        self.assertTrue(d.reason["why"])
        self.assertIn("router", d.reason["version"])

    def test_route_decision_roundtrip(self):
        d = route(simple_task())
        restored = RouteDecision.from_dict(d.to_dict())
        self.assertEqual(restored, d)

    def test_unknown_risk_level_is_policy_error_not_guess(self):
        with self.assertRaises(ValueError):
            route({**simple_task(), "risk_level": "whatever"})

    def test_candidate_actions_high_risk_flag_counts(self):
        """候选动作里出现高风险 kind 也触发 review，即使 task risk_level 是 low。"""
        task = {**simple_task(), "candidate_actions": [
            {"id": "a1", "kind": "payment", "risk_level": "low"},
        ]}
        d = route(task)
        self.assertEqual(d.route, "review")


if __name__ == "__main__":
    unittest.main()
