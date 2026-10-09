"""P4.4 — Octop execution adapter.

Minimal stable entry: the spike's propose/execute protocol mapping (see
editor/docs/integration/octop-compatibility-spike.md — Octop 1.0.2b5).
Every request carries contract_version, policy_version, trace_id and a
confirmation token. Receipts go through the verifier BEFORE any contract
update. Failure modes map to recoverable states:

- connection error      → OctopConnectionError (retry later)
- version mismatch      → OctopVersionMismatch (no guessing across versions)
- forbidden / bad token → OctopPermissionDenied / PermissionError
"""

from __future__ import annotations

from typing import Any, Protocol

from ..envelopes import PlanEnvelope, VerificationEnvelope

OCTOP_PROTOCOL_VERSION = "1.0.2b5"  # recorded from Octop pyproject at spike time


class OctopConnectionError(RuntimeError):
    """Octop unreachable — recoverable; caller may retry."""


class OctopVersionMismatch(RuntimeError):
    """Octop protocol version differs — never guess across versions."""


class OctopPermissionDenied(PermissionError):
    """A user rule forbids this kind — blocked before it reaches Octop."""


class OctopTransport(Protocol):
    def list_sessions(self) -> list[dict]: ...
    def read_tool_receipt(self, receipt_id: str) -> dict: ...
    def propose_tool_action(self, proposal: dict) -> dict: ...
    def execute_approved_action(self, proposal_id: str, confirmation_token: str) -> dict: ...


class OctopExecutionAdapter:
    def __init__(
        self,
        transport: OctopTransport,
        forbidden_actions: tuple[str, ...] = (),
        expected_version: str = OCTOP_PROTOCOL_VERSION,
    ) -> None:
        self.transport = transport
        self.forbidden_actions = frozenset(forbidden_actions)
        self.expected_version = expected_version
        self._version_checked = False

    # -- version gate --------------------------------------------------------

    def _check_version(self) -> None:
        if self._version_checked:
            return
        try:
            reported = getattr(self.transport, "protocol_version", OCTOP_PROTOCOL_VERSION)
        except Exception as e:  # transport probe failed
            raise OctopConnectionError(f"cannot reach Octop: {e}") from e
        if reported != self.expected_version:
            raise OctopVersionMismatch(
                f"octop reports {reported}, adapter expects {self.expected_version}"
            )
        self._version_checked = True

    # -- read side -----------------------------------------------------------

    def list_sessions(self) -> list[dict]:
        self._check_version()
        try:
            return self.transport.list_sessions()
        except OctopVersionMismatch:
            raise
        except Exception as e:
            raise OctopConnectionError(f"list_sessions failed: {e}") from e

    def read_tool_receipt(self, receipt_id: str) -> dict:
        self._check_version()
        try:
            return self.transport.read_tool_receipt(receipt_id)
        except Exception as e:
            raise OctopConnectionError(f"read receipt failed: {e}") from e

    # -- write side ----------------------------------------------------------

    def propose_tool_action(
        self,
        plan: PlanEnvelope,
        candidate: dict[str, Any],
        confirmation_token: str,
    ) -> dict:
        self._check_version()
        kind = str(candidate.get("kind", ""))
        if kind in self.forbidden_actions:
            raise OctopPermissionDenied(
                f"kind '{kind}' is forbidden by user rules — never reaches Octop"
            )
        proposal = {
            "proposal_id": f"prop_{plan.trace_id}_{candidate['id']}",
            "task_id": plan.task_id,
            "trace_id": plan.trace_id,
            "contract_version": plan.contract_version,
            "policy_version": plan.policy_version,
            "kind": kind,
            "risk_level": candidate.get("risk_level", "low"),
            "parameters": candidate.get("parameters", {}),
            "evidence_refs": list(candidate.get("evidence_refs", ())),
            "expected_token": confirmation_token,
            "status": "proposed",
        }
        try:
            return self.transport.propose_tool_action(proposal)
        except Exception as e:
            raise OctopConnectionError(f"propose failed: {e}") from e

    def execute_approved_action(
        self,
        plan: PlanEnvelope,
        proposal_id: str,
        confirmation_token: str,
    ) -> dict:
        self._check_version()
        try:
            return self.transport.execute_approved_action(proposal_id, confirmation_token)
        except PermissionError:
            raise  # invalid token — surface as-is (recoverable: re-confirm)
        except Exception as e:
            raise OctopConnectionError(f"execute failed: {e}") from e

    # -- verification --------------------------------------------------------

    def verify_receipt(self, plan: PlanEnvelope, receipt: dict) -> VerificationEnvelope:
        """Octop 结果先进入 verifier；verifier 的输出（而非 receipt 本身）
        才允许更新 TaskContract。"""
        checks: list[dict[str, Any]] = []
        status_ok = receipt.get("status") == "success"
        checks.append({"check": "receipt_status_success", "passed": status_ok})
        trace_ok = receipt.get("proposal_id") == f"prop_{plan.trace_id}_{plan.selected_action}"
        checks.append({"check": "proposal_matches_trace", "passed": trace_ok})
        if status_ok and trace_ok:
            status = "verified"
        elif not status_ok:
            status = "failed"
        else:
            status = "unverifiable"
        return VerificationEnvelope(
            trace_id=plan.trace_id,
            task_id=plan.task_id,
            contract_version=plan.contract_version,
            status=status,
            checks=checks,
            reason="receipt verified by OctopExecutionAdapter" if status == "verified" else "receipt did not pass verification",
        )
