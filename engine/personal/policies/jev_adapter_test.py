"""P3.3 tests — JEV adapter as an optional policy.

Acceptance (plan P3.3):
- 卸载 JEV 不影响 baseline (select_policy falls back cleanly)
- JEV 版本出现在每条 trace 中
- JEV 输出缺字段时进入 policy_error，不做猜测补全
"""

from __future__ import annotations

import unittest

from personal.policies.baseline import BaselinePolicy
from personal.policies.jev_adapter import (
    DeterministicJevStub,
    JevPolicyError,
    JEVPolicyAdapter,
    select_policy,
)
from personal.decision_types import (
    CandidateAction,
    DecisionConstraints,
    DecisionState,
)

DRAFT = CandidateAction(id="action_draft", kind="draft", risk_level="low", value=2.0,
                        parameters={"path": "workspace/d.md"}, evidence_refs=("evidence_1",))
SEND = CandidateAction(id="action_send", kind="external_send", risk_level="high", value=9.0)
STATE = DecisionState(task_id="task_01", goal="整理材料")
CONSTRAINTS = DecisionConstraints(allowed_scopes=("workspace",))


class TestJevAdapter(unittest.TestCase):
    def setUp(self):
        self.policy = JEVPolicyAdapter(DeterministicJevStub())

    def test_ranks_by_scorer_and_respects_constraints(self):
        r = self.policy.evaluate(STATE, [DRAFT, SEND], CONSTRAINTS)
        self.assertEqual(r.verdict, "select")
        self.assertEqual(r.selected_action, "action_draft")

    def test_high_risk_pick_still_requires_confirmation(self):
        bias = {"action_send": 5.0}  # force send to rank highest
        p = JEVPolicyAdapter(DeterministicJevStub(bias=bias))
        r = p.evaluate(STATE, [DRAFT, SEND], CONSTRAINTS)
        self.assertEqual(r.selected_action, "action_send")
        self.assertTrue(r.requires_confirmation)
        self.assertEqual(r.verdict, "needs_confirmation")

    def test_forbidden_kind_blocked(self):
        c = DecisionConstraints(allowed_scopes=("workspace",), forbidden_actions=("external_send",))
        r = self.policy.evaluate(STATE, [SEND], c)
        self.assertEqual(r.verdict, "blocked")
        self.assertIn("forbidden", r.rejected_actions[0][1])

    def test_info_gaps_ask_user(self):
        state = DecisionState(task_id="task_01", goal="x", missing_information=("a", "b"))
        r = self.policy.evaluate(state, [DRAFT], CONSTRAINTS)
        self.assertEqual(r.verdict, "ask_user")

    # -- missing fields -> policy_error, never guessed -------------------------

    def test_scorer_omitting_a_candidate_is_policy_error(self):
        class PartialStub:
            def score(self, question):
                return [{"option_id": "action_draft", "score": 1.0}]  # send missing

        r = JEVPolicyAdapter(PartialStub()).evaluate(STATE, [DRAFT, SEND], CONSTRAINTS)
        self.assertEqual(r.verdict, "policy_error")
        self.assertIn("did not score", r.reason)

    def test_scorer_answer_missing_score_is_policy_error(self):
        class BadStub:
            def score(self, question):
                return [{"option_id": "action_draft"}]  # no score field

        r = JEVPolicyAdapter(BadStub()).evaluate(STATE, [DRAFT], CONSTRAINTS)
        self.assertEqual(r.verdict, "policy_error")
        self.assertIn("missing option_id/score", r.reason)

    def test_scorer_non_numeric_score_is_policy_error(self):
        class BadStub:
            def score(self, question):
                return [{"option_id": "action_draft", "score": "very-good"}]

        r = JEVPolicyAdapter(BadStub()).evaluate(STATE, [DRAFT], CONSTRAINTS)
        self.assertEqual(r.verdict, "policy_error")

    def test_scorer_crash_is_policy_error_not_guess(self):
        class CrashStub:
            def score(self, question):
                raise RuntimeError("backend down")

        r = JEVPolicyAdapter(CrashStub()).evaluate(STATE, [DRAFT], CONSTRAINTS)
        self.assertEqual(r.verdict, "policy_error")
        self.assertIn("scorer failed", r.reason)

    # -- pluggability -----------------------------------------------------------

    def test_uninstalling_jev_leaves_baseline_working(self):
        # config without jev -> baseline
        self.assertIsInstance(select_policy({}), BaselinePolicy)
        self.assertIsInstance(select_policy({"policy": "baseline"}), BaselinePolicy)
        # baseline still evaluates fine after "removing" jev (never imported here)
        r = BaselinePolicy().evaluate(STATE, [DRAFT], CONSTRAINTS)
        self.assertEqual(r.verdict, "select")

    def test_jev_config_requires_scorer(self):
        with self.assertRaises(JevPolicyError):
            select_policy({"policy": "jev"})

    def test_version_in_every_result(self):
        r = self.policy.evaluate(STATE, [DRAFT], CONSTRAINTS)
        self.assertEqual(r.policy_version, "jev-adapter-0.1")

    def test_policy_comparison_on_same_input(self):
        """Both policies must agree on the safe pick for the same input."""
        baseline = BaselinePolicy().evaluate(STATE, [DRAFT, SEND], CONSTRAINTS)
        jev = self.policy.evaluate(STATE, [DRAFT, SEND], CONSTRAINTS)
        self.assertEqual(baseline.selected_action, jev.selected_action)


if __name__ == "__main__":
    unittest.main()
