"""P3.2 tests — baseline policy.

Acceptance targets:
- 信息缺口 >= 阈值 -> ask_user
- 高风险动作 requires_confirmation=true (never auto-execute)
- 没有证据的事实只能降级为 unknown -> facts without evidence never enter the
  state (caller's contract, pinned here via a helper)
- 简单任务按规则完成；危险任务不会自动执行
"""

from __future__ import annotations

import unittest

from personal.policies.baseline import BaselinePolicy
from personal.decision_types import (
    CandidateAction,
    DecisionConstraints,
    DecisionState,
)


def draft(value=2.0, evidence=("evidence_1",)):
    return CandidateAction(
        id="action_draft", kind="draft", risk_level="low", value=value,
        parameters={"path": "workspace/drafts/out.md"},
        evidence_refs=tuple(evidence),
    )


def send(value=9.0):
    return CandidateAction(
        id="action_send", kind="external_send", risk_level="high", value=value,
        parameters={"to": "colleague@example.com"},
        evidence_refs=("evidence_2",),
    )


def payment(value=20.0):
    return CandidateAction(id="action_pay", kind="payment", risk_level="high", value=value)


STATE = DecisionState(task_id="task_01", goal="整理材料")
SCOPES = DecisionConstraints(allowed_scopes=("workspace",))


class TestBaselinePolicy(unittest.TestCase):
    def setUp(self):
        self.policy = BaselinePolicy()

    # -- simple tasks complete by rules ---------------------------------------

    def test_simple_low_risk_task_selects_without_confirmation(self):
        r = self.policy.evaluate(STATE, [draft()], SCOPES)
        self.assertEqual(r.verdict, "select")
        self.assertEqual(r.selected_action, "action_draft")
        self.assertFalse(r.requires_confirmation)

    def test_prefers_lower_risk_over_higher_value(self):
        r = self.policy.evaluate(STATE, [send(), draft()], SCOPES)
        self.assertEqual(r.selected_action, "action_draft")
        self.assertIn(("action_send", r.rejected_actions[0][1]) and ("action_send", "higher risk or lower value than the selected action"), r.rejected_actions)

    # -- information gaps -> ask_user ------------------------------------------

    def test_info_gap_over_threshold_asks_user(self):
        state = DecisionState(task_id="task_01", goal="x", missing_information=("date", "budget"))
        r = self.policy.evaluate(state, [draft()], SCOPES)
        self.assertEqual(r.verdict, "ask_user")
        self.assertIsNone(r.selected_action)
        self.assertIn("date", r.reason)

    def test_info_gap_under_threshold_proceeds(self):
        state = DecisionState(task_id="task_01", goal="x", missing_information=("date",))
        r = self.policy.evaluate(state, [draft()], SCOPES)
        self.assertEqual(r.verdict, "select")

    # -- high risk always requires confirmation ---------------------------------

    def test_high_risk_requires_confirmation_even_when_best(self):
        r = self.policy.evaluate(STATE, [draft(value=1.0), send()], SCOPES)
        # draft wins on risk; but if send were the only candidate:
        r2 = self.policy.evaluate(STATE, [send()], SCOPES)
        self.assertTrue(r2.requires_confirmation)
        self.assertEqual(r2.verdict, "needs_confirmation")

    def test_never_auto_executes_when_only_high_risk_candidates(self):
        r = self.policy.evaluate(STATE, [payment()], SCOPES)
        self.assertIn(r.verdict, ("needs_confirmation", "blocked"))
        self.assertNotEqual(r.verdict, "select")

    # -- rules block -----------------------------------------------------------

    def test_forbidden_action_is_blocked(self):
        c = DecisionConstraints(allowed_scopes=("workspace",), forbidden_actions=("payment",))
        r = self.policy.evaluate(STATE, [payment()], c)
        self.assertEqual(r.verdict, "blocked")
        self.assertIn("forbidden", r.rejected_actions[0][1])

    def test_out_of_scope_target_is_blocked(self):
        outside = CandidateAction(
            id="action_out", kind="draft", risk_level="low", value=1.0,
            parameters={"path": "system32/config"},
        )
        r = self.policy.evaluate(STATE, [outside], SCOPES)
        self.assertEqual(r.verdict, "blocked")
        self.assertIn("outside the allowed scopes", r.rejected_actions[0][1])

    def test_budget_exceeded_blocks(self):
        c = DecisionConstraints(allowed_scopes=("workspace",), budget_remaining=10.0)
        costly = CandidateAction(
            id="action_cost", kind="submit", risk_level="medium", value=5.0,
            parameters={"cost": 99.0},
        )
        r = self.policy.evaluate(STATE, [costly], c)
        self.assertEqual(r.verdict, "blocked")
        self.assertIn("budget", r.reason)

    def test_risk_ceiling_blocks_higher_risk(self):
        c = DecisionConstraints(allowed_scopes=("workspace",), risk_ceiling="medium")
        r = self.policy.evaluate(STATE, [send()], c)
        self.assertEqual(r.verdict, "blocked")
        self.assertIn("risk ceiling", r.rejected_actions[0][1])

    # -- facts without evidence degrade to unknown ------------------------------

    def test_unbacked_facts_are_dropped_from_state(self):
        """Plan: 没有证据的事实只能降级为 unknown. The policy never sees them —
        this helper pins the caller-side contract."""
        facts = [
            {"id": "fact_backed", "value": {"k": 1}, "source_refs": ["evidence_1"]},
            {"id": "fact_unbacked", "value": {"k": 2}, "source_refs": []},
        ]

        def evidence_backed_only(fs):
            return tuple(f for f in fs if f.get("source_refs"))

        state = DecisionState(task_id="task_01", goal="x", facts=evidence_backed_only(facts))
        self.assertEqual(len(state.facts), 1)
        self.assertEqual(state.facts[0]["id"], "fact_backed")

    # -- determinism / traceability ---------------------------------------------

    def test_deterministic_and_versioned(self):
        a = self.policy.evaluate(STATE, [draft()], SCOPES)
        b = self.policy.evaluate(STATE, [draft()], SCOPES)
        self.assertEqual(a.to_dict(), b.to_dict())
        self.assertEqual(a.policy_version, "baseline-0.1")

    def test_trace_ready_dict(self):
        r = self.policy.evaluate(STATE, [draft()], SCOPES)
        d = r.to_dict()
        for key in ("verdict", "selected_action", "rejected_actions", "policy_version",
                    "evidence_refs", "rule_refs", "uncertainty", "requires_confirmation"):
            self.assertIn(key, d)


if __name__ == "__main__":
    unittest.main()
