"""P3.3 — JEV adapter (optional DecisionPolicy implementation).

Plan §4 / review doc: "JEV" 的具体定义尚未确认，架构不把它写死。
Laya (JEV-compatible scorer) is a text-classification model that answers
typed questions with choice/score/noul — it does NOT generate language.
This adapter treats JEV as a pluggable *scoring* backend:

    score(question_type, options, state) -> list[(option_id, score)]

Contract rules:
1. Implementing DecisionPolicy means it obeys the same select-only contract.
2. Raw JEV output with missing fields -> policy_error, no guessed completion.
3. Uninstalling/removing JEV must not affect BaselinePolicy — it is selected
   by configuration only (see select_policy()).
4. The adapter's scores NEVER override hard rules; rule checking still
   happens in the policy pipeline (constraints), and final authority is the
   RuleEngine (P3.4) + user confirmation.
"""

from __future__ import annotations

from typing import Protocol

from ..decision_policy import DecisionPolicy
from ..decision_types import (
    CandidateAction,
    DecisionConstraints,
    DecisionResult,
    DecisionState,
    is_high_risk,
)


class JevScorer(Protocol):
    """The narrow surface this adapter needs from any JEV-compatible backend
    (laya-serve /v1/systemone, or the deterministic stub used in tests)."""

    def score(self, question: dict) -> list[dict]:
        """Each answer: {option_id, score, confidence?}; noul allowed."""
        ...


class JevPolicyError(Exception):
    pass


class JEVPolicyAdapter(DecisionPolicy):
    name = "jev"

    def __init__(self, scorer: JevScorer):
        self.scorer = scorer

    def version(self) -> str:
        return "jev-adapter-0.1"

    def evaluate(
        self,
        state: DecisionState,
        candidates: list[CandidateAction],
        constraints: DecisionConstraints,
    ) -> DecisionResult:
        refusal = self._validate_inputs(state, candidates, constraints)
        if refusal:
            return self._error(refusal)

        question = {
            "question_type": "action_ranking",
            "task_id": state.task_id,
            "options": [{"option_id": c.id, "kind": c.kind, "risk_level": c.risk_level} for c in candidates],
            "context": {
                "goal": state.goal,
                "missing_information": list(state.missing_information),
            },
        }
        try:
            answers = self.scorer.score(question)
        except Exception as e:  # backend failure is not a guess opportunity
            return self._error(f"jev scorer failed: {e}")

        # Missing fields in raw output -> policy_error (plan: 缺字段不做猜测补全)
        scores: dict[str, float] = {}
        for ans in answers:
            if not isinstance(ans, dict):
                return self._error("jev returned a non-object answer")
            if "option_id" not in ans or "score" not in ans:
                return self._error(f"jev answer missing option_id/score: {ans}")
            try:
                scores[str(ans["option_id"])] = float(ans["score"])
            except (TypeError, ValueError):
                return self._error(f"jev score is not a number: {ans!r}")

        missing = [c.id for c in candidates if c.id not in scores]
        if missing:
            return self._error(f"jev did not score candidates: {', '.join(missing)}")

        # Apply constraints the same way baseline does — JEV only ranks.
        rejected: list[tuple[str, str]] = []
        live = [c for c in candidates if c.kind not in constraints.forbidden_actions
                or rejected.append((c.id, "forbidden by task contract"))]
        live = [c for c in candidates if c.kind not in constraints.forbidden_actions]
        rejected = [(c.id, "forbidden by task contract") for c in candidates if c.kind in constraints.forbidden_actions]
        if not live:
            return self._result("blocked", None, rejected, state, (), "every candidate is forbidden")

        ceiling_rank = {"low": 0, "medium": 1, "high": 2}
        in_ceiling = [c for c in live if ceiling_rank[c.risk_level] <= ceiling_rank[constraints.risk_ceiling]]
        rejected += [(c.id, "exceeds risk ceiling") for c in live if c not in in_ceiling]
        if not in_ceiling:
            return self._result("blocked", None, rejected, state, (), "no candidate within the risk ceiling")

        if len(state.missing_information) >= 2:
            return self._result("ask_user", None, rejected, state, (), "information gaps require clarification")

        pick = max(in_ceiling, key=lambda c: (scores[c.id], -ceiling_rank[c.risk_level]))
        requires_confirmation = is_high_risk(pick)
        return self._result(
            "needs_confirmation" if requires_confirmation else "select",
            pick.id, rejected, state, pick.evidence_refs,
            f"jev ranked {pick.id} highest (score {scores[pick.id]:.2f})",
            risk_level=pick.risk_level,
            expected_value=scores[pick.id],
            requires_confirmation=requires_confirmation,
        )

    def explain(self, result: DecisionResult) -> str:
        return f"JEV {result.policy_version}: {result.reason}"

    # -- helpers -------------------------------------------------------------

    def _error(self, reason: str) -> DecisionResult:
        return DecisionResult(
            verdict="policy_error", selected_action=None, rejected_actions=(),
            expected_value=0.0, risk_level=None, uncertainty=1.0,
            missing_information=(), evidence_refs=(), rule_refs=(),
            requires_confirmation=False, policy_version=self.version(), reason=reason,
        )

    def _result(self, verdict, selected, rejected, state, evidence_refs, reason,
                risk_level=None, expected_value=0.0, requires_confirmation=False) -> DecisionResult:
        return DecisionResult(
            verdict=verdict, selected_action=selected,
            rejected_actions=tuple(rejected), expected_value=expected_value,
            risk_level=risk_level,
            uncertainty=min(1.0, 0.1 * len(state.missing_information)),
            missing_information=state.missing_information,
            evidence_refs=tuple(evidence_refs or ()),
            rule_refs=(), requires_confirmation=requires_confirmation,
            policy_version=self.version(), reason=reason,
        )


class DeterministicJevStub:
    """Test scorer: ranks by a simple heuristic, no network, no model."""

    def __init__(self, bias: dict[str, float] | None = None):
        self.bias = bias or {}

    def score(self, question: dict) -> list[dict]:
        out = []
        for opt in question["options"]:
            base = {"read": 1.0, "draft": 2.0, "remind": 1.5}.get(opt["kind"], 0.5)
            risk_penalty = {"low": 0.0, "medium": 0.3, "high": 0.8}[opt["risk_level"]]
            out.append({
                "option_id": opt["option_id"],
                "score": max(0.0, base - risk_penalty + self.bias.get(opt["option_id"], 0.0)),
            })
        return out


def select_policy(config: dict) -> DecisionPolicy:
    """Configuration seam: 'jev' needs a scorer; anything else -> baseline.
    Removing JEV (or its config) leaves baseline fully functional."""
    if config.get("policy") == "jev":
        scorer = config.get("scorer")
        if scorer is None:
            raise JevPolicyError("policy=jev requires a scorer in config")
        return JEVPolicyAdapter(scorer)
    from .baseline import BaselinePolicy
    return BaselinePolicy()
