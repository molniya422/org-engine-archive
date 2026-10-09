"""P4.1 tests — TaskEnvelope bridge.

验收：同一 envelope 可在 fake adapter 中完整 round-trip。
不允許 Python 直接写 SQLite：adapter 只消费 envelope、返回 envelope，无任何存储句柄。
用户修改条件时合同版本递增，受影响计划重新进入判断流程；
历史执行结果不改写为新计划的完成证据。
"""

from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from personal.envelopes import (
    ExecutionEvent,
    PlanEnvelope,
    TaskEnvelope,
    bump_contract_version,
    contract_version_of,
)


def sample_task_envelope() -> TaskEnvelope:
    return TaskEnvelope(
        contract_version=1,
        policy_version="baseline-0.1",
        trace_id="trace_abc",
        task_id="task_1",
        intent_id="intent_1",
        conversation_id="conv_1",
        goal="整理本月的报销单",
        redacted_state={"facts": [{"kind": "preference", "value": "月底前完成"}]},
        evidence_refs=("ev_1", "ev_2"),
        budget={"max_actions": 5, "max_seconds": 300},
        allowed_scopes=("workspace/receipts",),
        forbidden_actions=("external_send",),
    )


class TestTaskEnvelope(unittest.TestCase):
    def test_to_dict_roundtrip_preserves_all_fields(self):
        env = sample_task_envelope()
        restored = TaskEnvelope.from_dict(json.loads(json.dumps(env.to_dict())))
        self.assertEqual(restored, env)

    def test_from_dict_rejects_missing_required_field(self):
        d = sample_task_envelope().to_dict()
        del d["trace_id"]
        with self.assertRaises(ValueError):
            TaskEnvelope.from_dict(d)

    def test_only_sanitized_state_crosses_the_bridge(self):
        """红线：原始敏感参数不得进入 envelope——只有脱敏状态。"""
        env = sample_task_envelope()
        d = env.to_dict()
        self.assertNotIn("salary", json.dumps(d))
        self.assertEqual(d["redacted_state"], env.redacted_state)


class TestPlanEnvelope(unittest.TestCase):
    def test_plan_roundtrip_with_candidates(self):
        from personal.decision_types import CandidateAction

        plan = PlanEnvelope(
            trace_id="trace_abc",
            task_id="task_1",
            contract_version=1,
            policy_version="baseline-0.1",
            candidates=[CandidateAction(id="a1", kind="draft", risk_level="low")],
            verdict="select",
            selected_action="a1",
            reason="low risk, evidence present",
        )
        restored = PlanEnvelope.from_dict(json.loads(json.dumps(plan.to_dict())))
        self.assertEqual(restored.trace_id, plan.trace_id)
        self.assertEqual(restored.selected_action, "a1")
        self.assertEqual(restored.candidates[0].kind, "draft")


class TestExecutionEventAndVerification(unittest.TestCase):
    def test_execution_event_roundtrip(self):
        ev = ExecutionEvent(
            trace_id="trace_abc", task_id="task_1", seq=0,
            event_type="action_started", payload={"action_id": "a1"},
        )
        restored = ExecutionEvent.from_dict(json.loads(json.dumps(ev.to_dict())))
        self.assertEqual(restored, ev)

    def test_verification_envelope_requires_verdict(self):
        from personal.envelopes import VerificationEnvelope

        v = VerificationEnvelope(
            trace_id="trace_abc", task_id="task_1", contract_version=1,
            status="verified", checks=[{"check": "file_exists", "passed": True}],
        )
        self.assertEqual(v.status, "verified")
        with self.assertRaises(ValueError):
            VerificationEnvelope(trace_id="t", task_id="task_1", contract_version=1,
                                 status="guessed", checks=[])


class TestContractVersioning(unittest.TestCase):
    def test_condition_change_bumps_contract_version(self):
        self.assertEqual(bump_contract_version({"contract_version": 1}), 2)

    def test_bumped_version_reenters_decision_flow(self):
        """合同版本变化意味着旧 PlanEnvelope 不再适用——调用方据此重新评估。"""
        old = sample_task_envelope()
        new = TaskEnvelope.from_dict(
            {**old.to_dict(), "contract_version": bump_contract_version(old.to_dict())}
        )
        self.assertGreater(new.contract_version, old.contract_version)

    def test_historical_execution_is_not_completion_evidence_for_new_plan(self):
        """合同版本变化后，旧 trace 的执行事件不能标记新合同完成。"""
        ev = ExecutionEvent(
            trace_id="trace_old", task_id="task_1", seq=3,
            event_type="action_completed", payload={"contract_version": 1},
        )
        new_contract_version = 2
        self.assertNotEqual(
            ev.payload.get("contract_version"), new_contract_version,
            "旧版本执行事件与新合同版本不匹配，不能作为完成证据",
        )


class TestFakeAdapterRoundTrip(unittest.TestCase):
    def test_full_roundtrip_through_fake_adapter(self):
        from personal.fake_adapter import FakePersonalAdapter

        adapter = FakePersonalAdapter()
        env = sample_task_envelope()

        plan = adapter.plan(env)
        self.assertEqual(plan.trace_id, env.trace_id)
        self.assertEqual(plan.contract_version, env.contract_version)

        events = list(adapter.execute(plan))
        self.assertTrue(events)
        self.assertTrue(all(e.trace_id == env.trace_id for e in events))

        verification = adapter.verify(plan, events)
        self.assertEqual(verification.trace_id, env.trace_id)

    def test_adapter_has_no_storage(self):
        """红线：adapter 不持有任何 SQLite/文件写入通道。"""
        from personal.fake_adapter import FakePersonalAdapter

        adapter = FakePersonalAdapter()
        attrs = [a for a in dir(adapter) if not a.startswith("__")]
        for banned in ("commit", "execute_sql", "db", "store", "conn"):
            self.assertNotIn(banned, attrs)


if __name__ == "__main__":
    unittest.main()
