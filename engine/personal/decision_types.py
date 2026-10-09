"""P3.1 — decision types.

The vocabulary of the decision layer. A policy evaluates a DecisionState
against CandidateActions under DecisionConstraints and returns a
DecisionResult. The result NEVER contains an executed state — execution is
the executor's job behind the permission gate (P5.2).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal

RiskLevel = Literal["low", "medium", "high"]
DecisionVerdict = Literal[
    "select",          # pick selected_action
    "ask_user",        # information gap — clarify before acting
    "needs_confirmation",  # pick, but only after a one-time confirmation
    "blocked",         # a hard rule or constraint forbids
    "policy_error",    # policy output itself was invalid (no guessing)
]


@dataclass(frozen=True)
class CandidateAction:
    id: str
    kind: str                                   # read | draft | remind | external_send | delete | submit | payment
    risk_level: RiskLevel
    parameters: dict[str, Any] = field(default_factory=dict)
    expected_effect: str = ""
    rollback: str = ""
    evidence_refs: tuple[str, ...] = ()
    value: float = 0.0                          # policy-scored or caller-provided expected value

    def to_dict(self) -> dict:
        return {
            "id": self.id, "kind": self.kind, "risk_level": self.risk_level,
            "parameters": self.parameters, "expected_effect": self.expected_effect,
            "rollback": self.rollback, "evidence_refs": list(self.evidence_refs),
            "value": self.value,
        }


@dataclass(frozen=True)
class DecisionState:
    task_id: str
    goal: str
    facts: tuple[dict[str, Any], ...] = ()      # active UserFacts (already filtered by evidence)
    evidence: tuple[str, ...] = ()              # evidence ids available to this decision
    missing_information: tuple[str, ...] = ()
    open_tasks: tuple[str, ...] = ()            # for anaphora/ambiguity checks


@dataclass(frozen=True)
class DecisionConstraints:
    allowed_scopes: tuple[str, ...] = ()
    forbidden_actions: tuple[str, ...] = ()
    budget_remaining: float | None = None
    risk_ceiling: RiskLevel = "high"


HIGH_RISK_KINDS = frozenset({"external_send", "delete", "submit", "payment"})


def is_high_risk(action: CandidateAction) -> bool:
    return action.risk_level == "high" or action.kind in HIGH_RISK_KINDS


@dataclass(frozen=True)
class DecisionResult:
    verdict: DecisionVerdict
    selected_action: str | None
    rejected_actions: tuple[tuple[str, str], ...]   # (action_id, reason)
    expected_value: float
    risk_level: RiskLevel | None
    uncertainty: float
    missing_information: tuple[str, ...]
    evidence_refs: tuple[str, ...]
    rule_refs: tuple[str, ...]
    requires_confirmation: bool
    policy_version: str
    reason: str = ""

    def to_dict(self) -> dict:
        return {
            "verdict": self.verdict,
            "selected_action": self.selected_action,
            "rejected_actions": [{"action_id": a, "reason": r} for a, r in self.rejected_actions],
            "expected_value": self.expected_value,
            "risk_level": self.risk_level,
            "uncertainty": self.uncertainty,
            "missing_information": list(self.missing_information),
            "evidence_refs": list(self.evidence_refs),
            "rule_refs": list(self.rule_refs),
            "requires_confirmation": self.requires_confirmation,
            "policy_version": self.policy_version,
            "reason": self.reason,
        }
