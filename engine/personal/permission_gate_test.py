"""P5.2 tests — permission gate.

验收：点击确认只批准当前动作，不批准未来同类动作。
- 执行前检查 user rule、workspace scope、risk level、confirmation token。
- token 绑定 task_id + action_id + parameters_hash；改参数即失效。
- token 一次性；过期不能重放。
- 拒绝原因对用户可读（中文，无术语）。
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from personal.canonical_json import canonical_hash_hex
from personal.permission_gate import (
    ConfirmationTicket,
    PermissionGate,
    PermissionDenied,
    token_for,
)
from personal.decision_types import CandidateAction
from personal.rules import EngineRule, RuleEngine


def params(p: dict | None = None) -> dict:
    return p if p is not None else {"path": "workspace/report.md", "content": "hi"}


def action(p: dict | None = None) -> CandidateAction:
    return CandidateAction(id="a1", kind="draft", risk_level="low", parameters=params(p))


class TestTokenBinding(unittest.TestCase):
    def test_token_binds_task_action_and_params(self):
        tok = token_for("task_1", "a1", params())
        d = tok.to_dict()
        self.assertEqual(d["task_id"], "task_1")
        self.assertEqual(d["action_id"], "a1")
        self.assertEqual(d["parameters_hash"], canonical_hash_hex(params()))

    def test_default_params_hash_is_a_frozen_contract(self):
        """写死期望值：与 TS canonical-json.ts 必须逐字节一致（非自我一致）。"""
        tok = token_for("task_1", "a1", {"path": "workspace/report.md", "content": "hi"})
        self.assertEqual(
            tok.parameters_hash,
            "a8a29fc6982d8f377d0a64339dc320e8b2f94be8cf26f50fb9a007d27c7505f6",
        )

    def test_issue_confirmation_rejects_non_integer_floats(self):
        """无法 canonical 化的参数是"不能确认"，不是内部错误（不能抛 TypeError）。"""
        gate = PermissionGate(RuleEngine())
        with self.assertRaises(PermissionDenied) as ctx:
            gate.issue_confirmation("task_1", action({"path": "workspace/a.md", "size": 9.9}))
        self.assertIn("无法确认", ctx.exception.user_message)

    def test_authorize_rejects_unhashable_parameters(self):
        gate = PermissionGate(RuleEngine())
        tok = gate.issue_confirmation("task_1", action())
        with self.assertRaises(PermissionDenied) as ctx:
            gate.authorize("task_1", action({"path": "workspace/a.md", "size": 9.9}), tok.token)
        self.assertIn("无法确认", ctx.exception.user_message)

    def test_modified_parameters_invalidate_token(self):
        """改参数 → hash 变 → token 失效。"""
        gate = PermissionGate(RuleEngine())
        tok = gate.issue_confirmation("task_1", action())
        tampered = action({"path": "workspace/other.md", "content": "hi"})
        with self.assertRaises(PermissionDenied) as ctx:
            gate.authorize("task_1", tampered, tok.token)
        self.assertIn("发生了变化", ctx.exception.user_message)

    def test_token_is_single_use(self):
        gate = PermissionGate(RuleEngine())
        tok = gate.issue_confirmation("task_1", action())
        gate.authorize("task_1", action(), tok.token)
        with self.assertRaises(PermissionDenied) as ctx:
            gate.authorize("task_1", action(), tok.token)
        self.assertIn("重新确认", ctx.exception.user_message)

    def test_expired_token_cannot_be_replayed(self):
        gate = PermissionGate(RuleEngine())
        tok = gate.issue_confirmation("task_1", action())
        gate.expire(tok.token)  # simulate clock expiry / revocation
        with self.assertRaises(PermissionDenied) as ctx:
            gate.authorize("task_1", action(), tok.token)
        self.assertIn("过期", ctx.exception.user_message)


class TestAuthorizationChecks(unittest.TestCase):
    def test_rule_deny_blocks_even_with_valid_token(self):
        """规则是硬的：token 再对，deny 规则一样拒绝。"""
        engine = RuleEngine([EngineRule(id="rule_d", when_event="draft", then_action="deny")])
        gate = PermissionGate(engine)
        tok = gate.issue_confirmation("task_1", action())
        with self.assertRaises(PermissionDenied) as ctx:
            gate.authorize("task_1", action(), tok.token)
        self.assertIn("规则", ctx.exception.user_message)

    def test_scope_violation_rejected(self):
        gate = PermissionGate(RuleEngine(), allowed_scopes=("workspace/",))
        out_of_scope = action({"path": "system32/config.ini", "content": "x"})
        with self.assertRaises(PermissionDenied) as ctx:
            gate.authorize("task_1", out_of_scope, None)
        self.assertIn("授权的范围", ctx.exception.user_message)

    def test_high_risk_requires_token(self):
        gate = PermissionGate(RuleEngine())
        risky = CandidateAction(id="a2", kind="payment", risk_level="high",
                                parameters={"amount": 1})
        with self.assertRaises(PermissionDenied) as ctx:
            gate.authorize("task_1", risky, None)
        self.assertIn("确认", ctx.exception.user_message)

    def test_low_risk_with_scope_and_no_rule_passes(self):
        gate = PermissionGate(RuleEngine(), allowed_scopes=("workspace/",))
        self.assertTrue(gate.authorize("task_1", action(), None).allowed)


class TestConfirmOnlyCurrentAction(unittest.TestCase):
    def test_confirmation_does_not_approve_future_same_kind_actions(self):
        """验收原文：确认只批准当前动作。同 task 第二个同类动作仍需新 token。
        （用高风险动作使确认成为必需，避免"低风险本来就不需要确认"的空转。）"""
        gate = PermissionGate(RuleEngine())
        pay1 = CandidateAction(id="pay1", kind="payment", risk_level="high",
                               parameters={"amount": 100, "to": "merchant"})
        tok = gate.issue_confirmation("task_1", pay1)
        gate.authorize("task_1", pay1, tok.token)
        pay2 = CandidateAction(id="pay2", kind="payment", risk_level="high",
                               parameters={"amount": 200, "to": "merchant"})
        with self.assertRaises(PermissionDenied):
            gate.authorize("task_1", pay2, None)  # no new token → denied


if __name__ == "__main__":
    unittest.main()
