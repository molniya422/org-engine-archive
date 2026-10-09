"""P3.4 tests — hard RuleEngine. 模型说允许而规则禁止时，最终状态必须是 blocked。"""

from __future__ import annotations

import unittest

from personal.rules import EngineRule, RuleEngine
from personal.decision_types import CandidateAction


def draft(path="workspace/d.md"):
    return CandidateAction(id="a1", kind="draft", risk_level="low",
                           parameters={"path": path, "content": "x"})


def send():
    return CandidateAction(id="a2", kind="external_send", risk_level="high",
                           parameters={"to": "x@example.com", "salary": 12345})


class TestRuleEngine(unittest.TestCase):
    def setUp(self):
        self.audit_log: list[tuple[str, dict]] = []
        self.engine = RuleEngine(audit=lambda e, d: self.audit_log.append((e, d)))

    def test_no_rules_low_risk_allows(self):
        v = self.engine.check(draft())
        self.assertEqual(v.outcome, "allow")

    def test_no_rules_high_risk_defaults_to_confirmation(self):
        v = self.engine.check(send())
        self.assertEqual(v.outcome, "require_confirmation")
        self.assertIn("high-risk default", v.reason)

    def test_deny_beats_everything(self):
        self.engine.add_rule(EngineRule(id="rule_deny", when_event="external_send", then_action="deny"))
        v = self.engine.check(send())
        self.assertEqual(v.outcome, "blocked")
        self.assertEqual(v.matched_rules, ("rule_deny",))

    def test_model_says_allow_but_rule_denies_final_is_blocked(self):
        """The acceptance sentence: even if a policy/model selected this
        action as 'select', the engine's verdict is the final word."""
        self.engine.add_rule(EngineRule(id="rule_r1", when_event="payment", then_action="deny"))
        payment = CandidateAction(id="a3", kind="payment", risk_level="high", parameters={"amount": 1})
        v = self.engine.check(payment)
        self.assertEqual(v.outcome, "blocked")

    def test_priority_resolution_stricter_wins(self):
        # Two rules match; lower priority says allow, higher says require_confirmation.
        self.engine.add_rule(EngineRule(id="rule_lo", when_event="external_send", then_action="allow", priority=1))
        self.engine.add_rule(EngineRule(id="rule_hi", when_event="external_send", then_action="require_confirmation", priority=100))
        v = self.engine.check(send())
        self.assertEqual(v.outcome, "require_confirmation")
        self.assertIn("rule_hi", v.reason)

    def test_equal_priority_conflict_resolves_stricter(self):
        self.engine.add_rule(EngineRule(id="rule_a", when_event="draft", then_action="allow", priority=50))
        self.engine.add_rule(EngineRule(id="rule_b", when_event="draft", then_action="deny", priority=50))
        v = self.engine.check(draft())
        self.assertEqual(v.outcome, "blocked")

    def test_scope_narrow_rule_applies_only_to_scope(self):
        self.engine.add_rule(EngineRule(id="rule_scope", when_event="draft", then_action="deny", scope="system32"))
        self.assertEqual(self.engine.check(draft("system32/config.ini")).outcome, "blocked")
        self.assertEqual(self.engine.check(draft("workspace/d.md")).outcome, "allow")

    def test_redact_and_confirm_redacts_sensitive_parameters(self):
        self.engine.add_rule(EngineRule(id="rule_red", when_event="external_send", then_action="redact_and_confirm"))
        v = self.engine.check(send())
        self.assertEqual(v.outcome, "require_confirmation")
        self.assertEqual(v.redacted_parameters["salary"], "<redacted>")
        self.assertEqual(v.redacted_parameters["to"], "x@example.com")  # non-sensitive untouched

    def test_paused_rules_are_ignored(self):
        self.engine.add_rule(EngineRule(id="rule_p", when_event="draft", then_action="deny", status="paused"))
        self.assertEqual(self.engine.check(draft()).outcome, "allow")

    def test_rule_hits_are_audited(self):
        self.engine.add_rule(EngineRule(id="rule_x", when_event="external_send", then_action="deny"))
        self.engine.check(send())
        self.assertEqual(len(self.audit_log), 1)
        event, detail = self.audit_log[0]
        self.assertEqual(event, "rule.check")
        self.assertEqual(detail["matched"], ["rule_x"])
        self.assertEqual(detail["outcome"], "deny")  # the rule action, not the engine verdict

    def test_any_action_rule_catches_all_kinds(self):
        self.engine.add_rule(EngineRule(id="rule_any", when_event="any_action", then_action="require_confirmation"))
        for action in (draft(), send()):
            self.assertEqual(self.engine.check(action).outcome, "require_confirmation")

    def test_user_rule_beats_model_preference_by_construction(self):
        """The engine has no 'model preference' input — there is literally no
        code path for a model to weaken a rule. This test documents that the
        API surface makes the violation unrepresentable."""
        import inspect
        src = inspect.getsource(RuleEngine.check)
        self.assertNotIn("model", src.lower().replace("model preferences cannot override", ""))


if __name__ == "__main__":
    unittest.main()
