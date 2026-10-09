"""P3.2 — baseline policy: rules first, then value, then information gaps.

Plan acceptance (P3.2):
- 信息缺口超过阈值时返回 ask_user.
- 高风险动作总是 requires_confirmation=true.
- 没有证据的事实只能降级为 unknown (facts without evidence cannot back a
  decision — they are dropped from the state before evaluation).
- Simple tasks complete by rules alone; dangerous tasks never auto-execute.

Ordering inside evaluate():
1. Structural refusal (policy_error).
2. Forbidden kinds / scopes / budget -> blocked with reasons.
3. Information gaps over threshold -> ask_user (nothing executes).
4. Among the remaining candidates, prefer: lower risk, then higher value,
   then more evidence. A selected high-risk action still requires
   confirmation — it never auto-executes.
"""

from __future__ import annotations

from ..decision_policy import DecisionPolicy
from ..decision_types import (
    CandidateAction,
    DecisionConstraints,
    DecisionResult,
    DecisionState,
    is_high_risk,
)

DEFAULT_INFO_GAP_THRESHOLD = 2


class BaselinePolicy(DecisionPolicy):
    name = "baseline"

    def __init__(self, info_gap_threshold: int = DEFAULT_INFO_GAP_THRESHOLD):
        self.info_gap_threshold = info_gap_threshold

    def version(self) -> str:
        return "baseline-0.1"

    def evaluate(
        self,
        state: DecisionState,
        candidates: list[CandidateAction],
        constraints: DecisionConstraints,
    ) -> DecisionResult:
        refusal = self._validate_inputs(state, candidates, constraints)
        if refusal:
            return self._error(refusal)

        rejected: list[tuple[str, str]] = []
        live: list[CandidateAction] = []

        # -- rule 1: forbidden actions ------------------------------------
        for c in candidates:
            if c.kind in constraints.forbidden_actions:
                rejected.append((c.id, f"action kind '{c.kind}' is forbidden by the task contract"))
            else:
                live.append(c)
        candidates = live
        live = []

        # -- rule 2: scopes ------------------------------------------------
        for c in candidates:
            if constraints.allowed_scopes:
                scope_ok = all(
                    any(param_scope.startswith(s) for s in constraints.allowed_scopes)
                    for param_scope in self._scopes_of(c)
                ) if self._scopes_of(c) else True
                if not scope_ok:
                    rejected.append((c.id, "target is outside the allowed scopes"))
                    continue
            live.append(c)
        candidates = live
        live = []

        # -- rule 3: budget ------------------------------------------------
        cost = sum(float(c.parameters.get("cost", 0.0)) for c in candidates)
        if constraints.budget_remaining is not None and cost > constraints.budget_remaining:
            rejected.append((candidates[0].id if candidates else "", "estimated cost exceeds the remaining budget"))
            return self._result("blocked", None, rejected, state, (), "budget exceeded")

        if not candidates:
            return self._result("blocked", None, rejected, state, (), "every candidate violates a rule or scope")

        # -- rule 4: information gaps --------------------------------------
        if len(state.missing_information) >= self.info_gap_threshold:
            return self._result(
                "ask_user", None, rejected, state, (),
                f"{len(state.missing_information)} pieces of information are missing: "
                + ", ".join(state.missing_information),
            )

        # -- rule 5: risk ceiling -------------------------------------------
        ceiling_rank = {"low": 0, "medium": 1, "high": 2}
        for c in candidates:
            if ceiling_rank[c.risk_level] > ceiling_rank[constraints.risk_ceiling]:
                rejected.append((c.id, f"risk {c.risk_level} exceeds the task's risk ceiling {constraints.risk_ceiling}"))
            else:
                live.append(c)
        candidates = live

        if not candidates:
            return self._result("blocked", None, rejected, state, (), "every candidate exceeds the risk ceiling")

        # -- selection: lower risk, then higher value, then more evidence ---
        def rank(c: CandidateAction):
            return (ceiling_rank[c.risk_level], -c.value, -len(c.evidence_refs))

        candidates.sort(key=rank)
        pick = candidates[0]
        for c in candidates[1:]:
            rejected.append((c.id, "higher risk or lower value than the selected action"))

        requires_confirmation = is_high_risk(pick)
        if requires_confirmation:
            rejected.append((pick.id, "needs one-time confirmation before it may run"))

        return self._result(
            "needs_confirmation" if requires_confirmation else "select",
            pick.id if not requires_confirmation else pick.id,
            rejected, state, pick.evidence_refs,
            f"selected {pick.kind} (risk {pick.risk_level})"
            + (" — awaiting user confirmation" if requires_confirmation else ""),
            risk_level=pick.risk_level,
            expected_value=pick.value,
            requires_confirmation=requires_confirmation,
        )

    def explain(self, result: DecisionResult) -> str:
        bits = [f"verdict={result.verdict}"]
        if result.selected_action:
            bits.append(f"action={result.selected_action}")
        if result.missing_information:
            bits.append(f"missing: {', '.join(result.missing_information)}")
        if result.reason:
            bits.append(result.reason)
        return " | ".join(bits)

    # -- helpers -------------------------------------------------------------

    @staticmethod
    def _scopes_of(c: CandidateAction) -> tuple[str, ...]:
        target = c.parameters.get("path") or c.parameters.get("target") or ""
        return (target,) if target else ()

    def _error(self, reason: str) -> DecisionResult:
        return DecisionResult(
            verdict="policy_error", selected_action=None, rejected_actions=(),
            expected_value=0.0, risk_level=None, uncertainty=1.0,
            missing_information=(), evidence_refs=(), rule_refs=(),
            requires_confirmation=False, policy_version=self.version(), reason=reason,
        )

    def _result(
        self,
        verdict,
        selected,
        rejected,
        state: DecisionState,
        evidence_refs,
        reason: str,
        risk_level=None,
        expected_value=0.0,
        requires_confirmation=False,
    ) -> DecisionResult:
        return DecisionResult(
            verdict=verdict,
            selected_action=selected,
            rejected_actions=tuple(rejected),
            expected_value=expected_value,
            risk_level=risk_level,
            uncertainty=min(1.0, 0.1 * len(state.missing_information)),
            missing_information=state.missing_information,
            evidence_refs=evidence_refs,
            rule_refs=(),
            requires_confirmation=requires_confirmation,
            policy_version=self.version(),
            reason=reason,
        )
