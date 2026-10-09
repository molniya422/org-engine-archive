"""P4.1 — fake adapter for full envelope round-trips.

Acceptance: 同一 envelope 可在 fake adapter 中完整 round-trip.
Deliberately storage-free: no sqlite, no file writes. The TS side owns
persistence; this adapter only transforms envelopes.
"""

from __future__ import annotations

from typing import Iterator

from .envelopes import ExecutionEvent, PlanEnvelope, TaskEnvelope, VerificationEnvelope
from .decision_policy import DecisionPolicy  # noqa: F401  (documented contract only)


class FakePersonalAdapter:
    """Consumes TaskEnvelope, returns Plan/Execution/Verification envelopes."""

    def plan(self, task: TaskEnvelope) -> PlanEnvelope:
        # Minimal deterministic plan: one low-risk draft candidate, selected.
        candidate = {
            "id": f"{task.task_id}_a0",
            "kind": "draft",
            "risk_level": "low",
            "parameters": {"path": "workspace/plan.md", "content": task.goal},
            "evidence_refs": list(task.evidence_refs),
        }
        verdict = "blocked" if task.forbidden_actions and "draft" in task.forbidden_actions else "select"
        return PlanEnvelope(
            trace_id=task.trace_id,
            task_id=task.task_id,
            contract_version=task.contract_version,
            policy_version=task.policy_version,
            candidates=[candidate],
            verdict=verdict,
            selected_action=candidate["id"] if verdict == "select" else None,
            reason=f"planned under policy {task.policy_version} (fake adapter)",
        )

    def execute(self, plan: PlanEnvelope) -> Iterator[ExecutionEvent]:
        yield ExecutionEvent(
            trace_id=plan.trace_id, task_id=plan.task_id, seq=0,
            event_type="action_started",
            payload={"action_id": plan.selected_action, "contract_version": plan.contract_version},
        )
        if plan.selected_action is None:
            yield ExecutionEvent(
                trace_id=plan.trace_id, task_id=plan.task_id, seq=1,
                event_type="action_failed",
                payload={"reason": plan.reason, "contract_version": plan.contract_version},
            )
            return
        yield ExecutionEvent(
            trace_id=plan.trace_id, task_id=plan.task_id, seq=1,
            event_type="action_completed",
            payload={"action_id": plan.selected_action, "contract_version": plan.contract_version},
        )

    def verify(self, plan: PlanEnvelope, events: list[ExecutionEvent]) -> VerificationEnvelope:
        completed = any(
            e.event_type == "action_completed"
            and e.payload.get("contract_version") == plan.contract_version
            for e in events
        )
        return VerificationEnvelope(
            trace_id=plan.trace_id,
            task_id=plan.task_id,
            contract_version=plan.contract_version,
            status="verified" if completed else "failed",
            checks=[{
                "check": "contract_version_matches",
                "passed": completed,
                "note": "historical events from other contract versions are not evidence",
            }],
            reason="all steps completed and verified (fake adapter)" if completed else "no completed step for this contract version",
        )
