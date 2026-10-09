"""P3.1 tests — DecisionPolicy protocol invariants.

Deterministic policies: same input must give the same output, the result
must never contain an executed state, and the policy must refuse to invent
candidates.
"""

from __future__ import annotations

import unittest
from dataclasses import replace

from personal.decision_policy import DecisionPolicy
from personal.decision_types import (
    CandidateAction,
    DecisionConstraints,
    DecisionResult,
    DecisionState,
    is_high_risk,
)

READ = CandidateAction(id="action_read", kind="read", risk_level="low", value=1.0)
SEND = CandidateAction(id="action_send", kind="external_send", risk_level="high", value=5.0)


class RecordingPolicy(DecisionPolicy):
    """Minimal concrete policy for contract tests."""

    name = "recording"

    def evaluate(self, state, candidates, constraints):
        refusal = self._validate_inputs(state, candidates, constraints)
        if refusal:
            return DecisionResult(
                verdict="policy_error", selected_action=None, rejected_actions=(),
                expected_value=0.0, risk_level=None, uncertainty=1.0,
                missing_information=(), evidence_refs=(), rule_refs=(),
                requires_confirmation=False, policy_version=self.version(),
                reason=refusal,
            )
        pick = max(candidates, key=lambda c: c.value)
        return DecisionResult(
            verdict="select", selected_action=pick.id,
            rejected_actions=tuple((c.id, "lower value") for c in candidates if c.id != pick.id),
            expected_value=pick.value, risk_level=pick.risk_level, uncertainty=0.1,
            missing_information=state.missing_information,
            evidence_refs=pick.evidence_refs, rule_refs=(),
            requires_confirmation=is_high_risk(pick),
            policy_version=self.version(),
        )

    def explain(self, result: DecisionResult) -> str:
        return f"selected {result.selected_action}: {result.reason}"

    def version(self) -> str:
        return "recording-0.1"


STATE = DecisionState(task_id="task_01", goal="compare hotels")
CONSTRAINTS = DecisionConstraints(allowed_scopes=("workspace/inbox",))


class TestDecisionPolicyContract(unittest.TestCase):
    def setUp(self):
        self.policy = RecordingPolicy()

    def test_result_never_contains_executed_state(self):
        result = self.policy.evaluate(STATE, [READ], CONSTRAINTS)
        d = result.to_dict()
        for forbidden in ("executed", "status", "receipt"):
            self.assertNotIn(forbidden, d)

    def test_deterministic(self):
        a = self.policy.evaluate(STATE, [READ, SEND], CONSTRAINTS)
        b = self.policy.evaluate(STATE, [READ, SEND], CONSTRAINTS)
        self.assertEqual(a.to_dict(), b.to_dict())

    def test_high_risk_selection_requires_confirmation(self):
        result = self.policy.evaluate(STATE, [SEND], CONSTRAINTS)
        self.assertTrue(result.requires_confirmation)

    def test_low_risk_selection_does_not_require_confirmation(self):
        result = self.policy.evaluate(STATE, [READ], CONSTRAINTS)
        self.assertFalse(result.requires_confirmation)

    def test_empty_candidates_is_policy_error_not_guess(self):
        result = self.policy.evaluate(STATE, [], CONSTRAINTS)
        self.assertEqual(result.verdict, "policy_error")
        self.assertIsNone(result.selected_action)

    def test_duplicate_ids_refused(self):
        result = self.policy.evaluate(STATE, [READ, replace(READ)], CONSTRAINTS)
        self.assertEqual(result.verdict, "policy_error")

    def test_missing_task_id_refused(self):
        result = self.policy.evaluate(
            DecisionState(task_id="", goal="x"), [READ], CONSTRAINTS
        )
        self.assertEqual(result.verdict, "policy_error")

    def test_is_high_risk_by_kind_or_level(self):
        self.assertTrue(is_high_risk(SEND))
        self.assertTrue(is_high_risk(CandidateAction(id="a", kind="read", risk_level="high")))
        self.assertFalse(is_high_risk(READ))

    def test_result_carries_policy_version(self):
        result = self.policy.evaluate(STATE, [READ], CONSTRAINTS)
        self.assertEqual(result.policy_version, "recording-0.1")


if __name__ == "__main__":
    unittest.main()
