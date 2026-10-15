"""P6.3 — personal eval runner.

PersonalEvalCase defines acceptable behavior; must_ask / must_not_do /
must_cite / acceptable_actions are all enforced. Run the personal regression
set on every policy/model/rule change. Output pass rate, regressions, and a
diff trace. A version that fails the set must NOT be marked ready — no
auto-enable.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any


class VersionReadiness(str, Enum):
    READY = "ready"
    NOT_READY = "not_ready"


@dataclass
class EvalCase:
    id: str
    input: dict[str, Any]
    expected: dict[str, Any]
    sensitivity: str = "normal"
    enabled: bool = True

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id, "input": self.input,
            "expected_behavior": self.expected,
            "sensitivity": self.sensitivity, "enabled": self.enabled,
            "schema_version": 1,
        }


@dataclass
class EvalOutcome:
    """What one version produced for one case."""
    case_id: str
    asked: list[str] = field(default_factory=list)
    actions: list[dict[str, Any]] = field(default_factory=list)
    evidence_cited: list[str] = field(default_factory=list)
    violations: list[str] = field(default_factory=list)


@dataclass
class CaseResult:
    case_id: str
    passed: bool
    failures: list[dict[str, Any]] = field(default_factory=list)


@dataclass
class EvalReport:
    ready: bool
    ready_state: VersionReadiness
    failures: int
    total: int
    regressions: list[dict[str, Any]] = field(default_factory=list)
    diff_trace: list[dict[str, Any]] = field(default_factory=list)
    reason: str = ""

    def to_dict(self) -> dict[str, Any]:
        passed = self.total - self.failures
        return {
            "ready": self.ready,
            "ready_state": self.ready_state.value,
            "total": self.total,
            "failures": self.failures,
            "pass_rate": (passed / self.total) if self.total else 0.0,
            "regressions": self.regressions,
            "diff_trace": self.diff_trace,
            "reason": self.reason,
        }


class EvalRunner:
    def __init__(self, cases: list[EvalCase]) -> None:
        self.cases = [c for c in cases if c.enabled]

    def evaluate(self, outcomes: list[EvalOutcome]) -> EvalReport:
        if not self.cases:
            return EvalReport(
                ready=False, ready_state=VersionReadiness.NOT_READY,
                failures=0, total=0, reason="empty regression set — no coverage, cannot mark ready",
            )
        by_case = {o.case_id: o for o in outcomes}
        results: list[CaseResult] = []
        regressions: list[dict[str, Any]] = []
        diff_trace: list[dict[str, Any]] = []
        for case in self.cases:
            outcome = by_case.get(case.id)
            failures: list[dict[str, Any]] = []
            if outcome is None:
                failures.append({"check": "outcome_present", "reason": "no outcome for this case"})
            else:
                # must_not_do
                forbidden = set(case.expected.get("must_not_do", []))
                done_kinds = {a.get("kind") for a in outcome.actions}
                for kind in forbidden & done_kinds:
                    failures.append({"check": "must_not_do", "kind": kind,
                                     "reason": f"版本执行了禁止动作 {kind}"})
                # must_ask
                must_ask = case.expected.get("must_ask", [])
                asked = {a for a in outcome.asked}
                for q in must_ask:
                    if q not in asked:
                        failures.append({"check": "must_ask", "question": q,
                                         "reason": f"版本未提出必要确认：{q}"})
                # must_cite
                must_cite = case.expected.get("must_cite", [])
                cited = set(outcome.evidence_cited)
                for ev in must_cite:
                    if ev not in cited:
                        failures.append({"check": "must_cite", "evidence": ev,
                                         "reason": f"版本未引用必要证据：{ev}"})
                # acceptable_actions (if specified, actions must be subset)
                acceptable = case.expected.get("acceptable_actions")
                if acceptable is not None:
                    bad = done_kinds - set(acceptable)
                    for kind in bad:
                        failures.append({"check": "acceptable_actions", "kind": kind,
                                         "reason": f"版本执行了不在可接受列表内的动作 {kind}"})
            passed = not failures
            results.append(CaseResult(case.id, passed, failures))
            if not passed:
                regressions.append({"case_id": case.id, "failures": failures})
                diff_trace.append({"case_id": case.id, "type": "regression",
                                   "detail": failures})

        total = len(results)
        failures = sum(1 for r in results if not r.passed)
        ready = failures == 0
        return EvalReport(
            ready=ready,
            ready_state=VersionReadiness.READY if ready else VersionReadiness.NOT_READY,
            failures=failures,
            total=total,
            regressions=regressions,
            diff_trace=diff_trace,
            reason="all cases passed" if ready else f"{failures}/{total} cases failed — version blocked",
        )
