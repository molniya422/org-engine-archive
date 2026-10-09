"""P4.4 tests — Octop execution adapter.

验收：Org Engine 可以使用 Octop 执行一个低风险本地任务；
高风险动作不能绕过 Org Engine 的确认和验证。

Connection failure / version incompatibility / permission denial map to
recoverable states — never guessed success.
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from personal.adapters.octop import (
    OCTOP_PROTOCOL_VERSION,
    OctopConnectionError,
    OctopPermissionDenied,
    OctopVersionMismatch,
    OctopExecutionAdapter,
)
from personal.envelopes import PlanEnvelope, TaskEnvelope


def fake_octop(version: str = OCTOP_PROTOCOL_VERSION) -> object:
    """In-memory fake Octop: sessions, receipts, propose, execute."""
    class FakeOctop:
        protocol_version = version

        def __init__(self) -> None:
            self.sessions = [{"id": "s1", "name": "本地文件整理"}]
            self.receipts: dict[str, dict] = {}
            self.proposals: dict[str, dict] = {}
            self.executed: list[dict] = []

        def list_sessions(self) -> list[dict]:
            return self.sessions

        def read_tool_receipt(self, receipt_id: str) -> dict:
            if receipt_id not in self.receipts:
                raise KeyError(receipt_id)
            return self.receipts[receipt_id]

        def propose_tool_action(self, proposal: dict) -> dict:
            pid = proposal["proposal_id"]
            self.proposals[pid] = {**proposal, "status": "proposed"}
            return {"proposal_id": pid, "status": "proposed"}

        def execute_approved_action(self, proposal_id: str, confirmation_token: str) -> dict:
            p = self.proposals[proposal_id]
            if p.get("risk_level") == "high" and confirmation_token != p.get("expected_token"):
                raise PermissionError("confirmation token invalid")
            p["status"] = "executed"
            receipt = {
                "receipt_id": f"r_{proposal_id}",
                "proposal_id": proposal_id,
                "status": "success",
                "result": {"written": True},
            }
            self.receipts[receipt["receipt_id"]] = receipt
            self.executed.append({"proposal_id": proposal_id, "token": confirmation_token})
            return receipt

    return FakeOctop()


def task_envelope(forbidden: tuple[str, ...] = ()) -> TaskEnvelope:
    return TaskEnvelope(
        contract_version=1, policy_version="baseline-0.1", trace_id="trace_t",
        task_id="task_t", intent_id="i", conversation_id="c", goal="整理文件",
        redacted_state={}, evidence_refs=("ev1",),
        budget={"max_actions": 3},
        allowed_scopes=("workspace/",), forbidden_actions=forbidden,
    )


def plan(selected: str | None = "a1", kind: str = "draft", risk: str = "low") -> PlanEnvelope:
    return PlanEnvelope(
        trace_id="trace_t", task_id="task_t", contract_version=1,
        policy_version="baseline-0.1",
        candidates=[{"id": "a1", "kind": kind, "risk_level": risk,
                     "parameters": {"path": "workspace/x.md"},
                     "evidence_refs": ["ev1"]}],
        verdict="select" if selected else "needs_confirmation",
        selected_action=selected,
        requires_confirmation=risk == "high",
        reason="",
    )


class TestOctopAdapter(unittest.TestCase):
    def setUp(self):
        self.octop = fake_octop()
        self.adapter = OctopExecutionAdapter(self.octop)  # type: ignore[arg-type]

    def test_list_sessions(self):
        sessions = self.adapter.list_sessions()
        self.assertEqual(sessions[0]["id"], "s1")

    def test_read_receipt_maps_to_personal_evidence(self):
        self.octop.receipts["r1"] = {  # type: ignore[attr-defined]
            "receipt_id": "r1", "proposal_id": "p1", "status": "success", "result": {},
        }
        receipt = self.adapter.read_tool_receipt("r1")
        self.assertEqual(receipt["receipt_id"], "r1")

    def test_low_risk_task_executes_end_to_end(self):
        """验收：低风险本地任务完整走通 propose → execute → receipt。"""
        p = plan()
        proposal = self.adapter.propose_tool_action(
            p, p.candidates[0], confirmation_token="tok_1")  # type: ignore[index]
        receipt = self.adapter.execute_approved_action(
            p, proposal["proposal_id"], confirmation_token="tok_1")
        self.assertEqual(receipt["status"], "success")

    def test_high_risk_requires_valid_confirmation_token(self):
        """验收红线：高风险动作没有有效 token 就不能执行。"""
        p = plan(kind="external_send", risk="high")
        proposal = self.adapter.propose_tool_action(
            p, p.candidates[0], confirmation_token="tok_secret")  # type: ignore[index]
        with self.assertRaises(PermissionError):
            self.adapter.execute_approved_action(
                p, proposal["proposal_id"], confirmation_token="wrong")
        # correct token executes
        receipt = self.adapter.execute_approved_action(
            p, proposal["proposal_id"], confirmation_token="tok_secret")
        self.assertEqual(receipt["status"], "success")

    def test_forbidden_action_blocked_before_proposal(self):
        """规则禁止的 kind 在 propose 之前就被拒绝——不进 Octop。"""
        adapter = OctopExecutionAdapter(
            self.octop, forbidden_actions=("external_send",))  # type: ignore[arg-type]
        p = plan(kind="external_send", risk="high")
        with self.assertRaises(OctopPermissionDenied):
            adapter.propose_tool_action(
                p, p.candidates[0], confirmation_token="t")  # type: ignore[index]
        self.assertEqual(self.octop.executed, [])  # type: ignore[attr-defined]

    def test_connection_failure_is_recoverable_state(self):
        class DeadOctop:
            def list_sessions(self) -> list[dict]:
                raise ConnectionError("refused")
        adapter = OctopExecutionAdapter(DeadOctop())  # type: ignore[arg-type]
        with self.assertRaises(OctopConnectionError):
            adapter.list_sessions()

    def test_version_mismatch_is_recoverable_state(self):
        adapter = OctopExecutionAdapter(
            fake_octop(version="0.9.0"),  # type: ignore[arg-type]
            expected_version=OCTOP_PROTOCOL_VERSION)
        with self.assertRaises(OctopVersionMismatch):
            adapter.list_sessions()

    def test_every_request_carries_versions_and_trace(self):
        """每次请求附带 contract_version、policy_version、trace_id、token。"""
        p = plan()
        proposal = self.adapter.propose_tool_action(
            p, p.candidates[0], confirmation_token="tok")  # type: ignore[index]
        stored = self.octop.proposals[proposal["proposal_id"]]  # type: ignore[attr-defined]
        self.assertEqual(stored["contract_version"], 1)
        self.assertEqual(stored["policy_version"], "baseline-0.1")
        self.assertEqual(stored["trace_id"], "trace_t")

    def test_receipt_enters_verifier_before_contract_update(self):
        """Octop 回执先经 verifier，得到 VerificationEnvelope，而非直接当完成。"""
        p = plan()
        proposal = self.adapter.propose_tool_action(
            p, p.candidates[0], confirmation_token="tok")  # type: ignore[index]
        receipt = self.adapter.execute_approved_action(
            p, proposal["proposal_id"], confirmation_token="tok")
        verification = self.adapter.verify_receipt(p, receipt)
        self.assertEqual(verification.trace_id, p.trace_id)
        self.assertEqual(verification.status, "verified")
        self.assertTrue(any(c["check"] == "receipt_status_success" for c in verification.checks))

    def test_failed_receipt_maps_to_failed_verification(self):
        p = plan()
        proposal = self.adapter.propose_tool_action(
            p, p.candidates[0], confirmation_token="tok")  # type: ignore[index]
        receipt = self.adapter.execute_approved_action(
            p, proposal["proposal_id"], confirmation_token="tok")
        bad = {**receipt, "status": "failed"}
        verification = self.adapter.verify_receipt(p, bad)
        self.assertEqual(verification.status, "failed")


if __name__ == "__main__":
    unittest.main()
