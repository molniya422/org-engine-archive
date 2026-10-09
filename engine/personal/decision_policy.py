"""P3.1 — DecisionPolicy protocol.

    evaluate(state, candidates, constraints) -> DecisionResult
    explain(result) -> str
    version() -> str

Contract rules (plan P3.1):
1. A policy ONLY selects among candidates. It never calls tools and never
   produces an executed state — the return type has no execution fields.
2. A policy never modifies user rules. Rules are inputs (constraints), and
   rule hits travel out as rule_refs for the RuleEngine to audit.
3. Every result carries policy_version so DecisionTrace is replayable.
4. Deterministic policies must be pure functions of their inputs.
"""

from __future__ import annotations

from abc import ABC, abstractmethod

from .decision_types import DecisionConstraints, DecisionResult, DecisionState, CandidateAction


class DecisionPolicy(ABC):
    name: str = "abstract"

    @abstractmethod
    def evaluate(
        self,
        state: DecisionState,
        candidates: list[CandidateAction],
        constraints: DecisionConstraints,
    ) -> DecisionResult:
        ...

    @abstractmethod
    def explain(self, result: DecisionResult) -> str:
        ...

    @abstractmethod
    def version(self) -> str:
        ...

    def _validate_inputs(
        self,
        state: DecisionState,
        candidates: list[CandidateAction],
        constraints: DecisionConstraints,
    ) -> str | None:
        """Shared structural validation; returns a refusal reason or None."""
        if not state.task_id:
            return "missing task_id"
        if not candidates:
            return "no candidate actions to evaluate"
        ids = [c.id for c in candidates]
        if len(ids) != len(set(ids)):
            return "duplicate candidate action ids"
        if constraints.forbidden_actions:
            pass  # per-candidate checks happen in the policy implementation
        return None
