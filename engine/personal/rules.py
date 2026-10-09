"""P3.4 — the hard RuleEngine.

User rules are law. The model, a policy, or anything else can only make an
outcome STRICTER, never looser. Plan acceptance (P3.4):

- 规则按 priority 评估（higher first）。
- 冲突规则采用更严格动作：deny > redact_and_confirm > require_confirmation > allow。
- 用户明确规则优先于模型偏好。
- 规则命中写入 rule_refs 和 audit event。
- 模型返回允许执行而规则禁止时，最终状态必须是 blocked。
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable, Literal

from .decision_types import CandidateAction

# Strictness ladder — higher is stricter. Conflicts resolve to the strictest.
STRICTNESS: dict[str, int] = {
    "allow": 0,
    "require_confirmation": 1,
    "redact_and_confirm": 2,
    "deny": 3,
}

RuleStatus = Literal["active", "paused", "revoked"]


@dataclass(frozen=True)
class EngineRule:
    id: str
    when_event: str                  # external_send | delete | payment | submit | read_file | create_draft | create_reminder | any_action
    then_action: str                 # allow | require_confirmation | redact_and_confirm | deny
    priority: int = 0
    scope: str | None = None         # prefix match on the action target
    source: str = "user_explicit"
    status: RuleStatus = "active"
    version: int = 1


@dataclass(frozen=True)
class RuleVerdict:
    outcome: str                     # allow | require_confirmation | redact_and_confirm | deny | blocked
    matched_rules: tuple[str, ...]
    reason: str
    redacted_parameters: dict[str, Any] | None = None


def _action_matches_rule(action: CandidateAction, rule: EngineRule) -> bool:
    # "all" is the canonical wildcard in the user-rule schema's scope field and
    # commonly used as the event value too; accept it alongside any_action.
    if rule.when_event not in ("any_action", "all") and rule.when_event != action.kind:
        return False
    if rule.scope is not None and rule.scope != "all":
        target = str(action.parameters.get("path") or action.parameters.get("target") or "")
        if target and not target.startswith(rule.scope):
            return False
    return True


SENSITIVE_KEYS = frozenset({"salary", "id_number", "phone", "address", "bank_account", "password", "secret"})


class RuleEngine:
    def __init__(self, rules: list[EngineRule] | None = None,
                 audit: Callable[[str, dict], None] | None = None):
        self.rules = list(rules or [])
        self.audit = audit or (lambda event, detail: None)

    def add_rule(self, rule: EngineRule) -> None:
        self.rules.append(rule)

    def check(self, action: CandidateAction) -> RuleVerdict:
        """Evaluate all active matching rules; resolve conflicts stricter.
        This is the LAST word — model preferences cannot override it."""
        matching = sorted(
            (r for r in self.rules
             if r.status == "active" and _action_matches_rule(action, r)),
            key=lambda r: -r.priority,
        )

        if not matching:
            # No user rule says otherwise; default posture is conservative:
            # high-risk kinds still need confirmation.
            from .decision_types import is_high_risk
            if is_high_risk(action):
                return RuleVerdict(
                    outcome="require_confirmation",
                    matched_rules=(),
                    reason=f"no user rule covers '{action.kind}'; high-risk default applies",
                )
            return RuleVerdict(outcome="allow", matched_rules=(), reason="no user rule restricts this action")

        strictest = max(matching, key=lambda r: STRICTNESS.get(r.then_action, 0))
        rule_refs = tuple(r.id for r in matching)
        self.audit("rule.check", {
            "action_id": action.id,
            "kind": action.kind,
            "matched": list(rule_refs),
            "outcome": strictest.then_action,
        })

        if strictest.then_action == "deny":
            return RuleVerdict(
                outcome="blocked",
                matched_rules=rule_refs,
                reason=f"rule {strictest.id} forbids '{action.kind}'"
                       + (f" within scope {strictest.scope}" if strictest.scope else ""),
            )
        if strictest.then_action == "redact_and_confirm":
            redacted = {
                k: ("<redacted>" if k in SENSITIVE_KEYS else v)
                for k, v in action.parameters.items()
            }
            return RuleVerdict(
                outcome="require_confirmation",
                matched_rules=rule_refs,
                reason=f"rule {strictest.id} requires redaction of sensitive fields and confirmation",
                redacted_parameters=redacted,
            )
        if strictest.then_action == "require_confirmation":
            return RuleVerdict(
                outcome="require_confirmation",
                matched_rules=rule_refs,
                reason=f"rule {strictest.id} requires one-time confirmation",
            )
        return RuleVerdict(
            outcome="allow",
            matched_rules=rule_refs,
            reason=f"rule {strictest.id} allows this action",
        )
