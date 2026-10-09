"""P4.2 — execution router.

Routes a task to simple / review / parallel based on complexity, evidence
count, risk, and tool count. Same input + same ROUTER_VERSION → same route,
same reason — stable, explainable, replayable.

- simple:   one model, one pass (low complexity, low risk, few tools).
- review:   candidate generation + review pass (high risk anywhere, or thin
            evidence).
- parallel: maps onto the existing harness multiagent_orchestrator for
            multi-tool / multi-step collaboration.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal

RouteKind = Literal["simple", "review", "parallel"]

ROUTER_VERSION = "router-0.1"

RISK_ORDER = {"low": 0, "medium": 1, "high": 2}

HIGH_RISK_KINDS = frozenset({"external_send", "delete", "submit", "payment"})

# Thresholds — versioned with ROUTER_VERSION so replay is stable.
PARALLEL_TOOL_COUNT = 4
PARALLEL_COMPLEXITY = 4
THIN_EVIDENCE = 1


@dataclass(frozen=True)
class RouteDecision:
    route: RouteKind
    reason: dict[str, Any]          # {version, factors, why, executor}

    def to_dict(self) -> dict[str, Any]:
        return {"route": self.route, "reason": self.reason}

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> "RouteDecision":
        return cls(route=d["route"], reason=dict(d["reason"]))


def _has_high_risk_candidate(task: dict[str, Any]) -> bool:
    for c in task.get("candidate_actions", []):
        if c.get("kind") in HIGH_RISK_KINDS or c.get("risk_level") == "high":
            return True
    return False


def route(task: dict[str, Any]) -> RouteDecision:
    """Pure function of (task, ROUTER_VERSION). No model, no randomness."""
    risk = task.get("risk_level", "low")
    if risk not in RISK_ORDER:
        raise ValueError(f"unknown risk_level '{risk}' — refusing to guess")

    complexity = int(task.get("complexity", 1))
    evidence_count = int(task.get("evidence_count", 0))
    tool_count = int(task.get("tool_count", 0))
    high_risk = RISK_ORDER[risk] >= 2 or _has_high_risk_candidate(task)
    thin_evidence = evidence_count <= THIN_EVIDENCE
    heavy = tool_count >= PARALLEL_TOOL_COUNT or complexity >= PARALLEL_COMPLEXITY

    factors: list[str] = []
    if heavy:
        factors.append(f"tools={tool_count},complexity={complexity}")
    if high_risk:
        factors.append("risk=high")
    if thin_evidence:
        factors.append(f"evidence={evidence_count}")

    # Priority: parallel > review > simple (heavier route wins on conflict).
    if heavy:
        kind: RouteKind = "parallel"
        why = "multiple tools or high complexity → fan out to multiagent_orchestrator"
        executor = "multiagent_orchestrator"
    elif high_risk or thin_evidence:
        kind = "review"
        why = ("high-risk action present → candidate + review pass" if high_risk
               else f"evidence thin ({evidence_count}) → candidate + review pass")
        executor = "review_pair"
    else:
        kind = "simple"
        why = f"low complexity, {evidence_count} evidence refs, {tool_count} tools → single model"
        executor = "single_model"

    return RouteDecision(
        route=kind,
        reason={
            "version": ROUTER_VERSION,
            "factors": factors,
            "why": why,
            "executor": executor,
        },
    )
