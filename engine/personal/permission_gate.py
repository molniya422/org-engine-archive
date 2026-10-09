"""P5.2 — permission gate.

The last door before execution. Checks, in order:
  1. user rules (RuleEngine — hard, deny wins),
  2. workspace scope (action parameters must stay inside allowed prefixes),
  3. risk level (high-risk requires a confirmation token),
  4. confirmation token binding.

Tokens bind (task_id, action_id, parameters_hash), are single-use, and can
expire — clicking "confirm" approves exactly one action with exactly these
parameters, never a class of future actions. All denials carry a plain
Chinese user_message with no internal jargon.
"""

from __future__ import annotations

import hashlib
import json
import secrets
from dataclasses import dataclass, field
from typing import Any

from .decision_types import CandidateAction, is_high_risk
from .rules import RuleEngine


def _param_hash(params: dict[str, Any]) -> str:
    return hashlib.sha256(
        json.dumps(params, sort_keys=True, ensure_ascii=False).encode()
    ).hexdigest()


@dataclass(frozen=True)
class ConfirmationTicket:
    token: str
    task_id: str
    action_id: str
    parameters_hash: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "token": self.token, "task_id": self.task_id,
            "action_id": self.action_id, "parameters_hash": self.parameters_hash,
        }


def token_for(task_id: str, action_id: str, parameters: dict[str, Any]) -> ConfirmationTicket:
    return ConfirmationTicket(
        token=f"tok_{secrets.token_hex(12)}",
        task_id=task_id,
        action_id=action_id,
        parameters_hash=_param_hash(parameters),
    )


@dataclass(frozen=True)
class PermissionDenied(Exception):
    user_message: str
    detail: str = ""

    def __str__(self) -> str:  # pragma: no cover
        return self.user_message


@dataclass
class AuthorizationOutcome:
    allowed: bool
    reason: str = ""
    rule_refs: tuple[str, ...] = ()
    ticket: ConfirmationTicket | None = None


@dataclass
class PermissionGate:
    """token 状态保存在 gate 实例里（一次性、可过期）。"""
    rule_engine: RuleEngine
    allowed_scopes: tuple[str, ...] = ()
    _open_tokens: dict[str, ConfirmationTicket] = field(default_factory=dict)

    # -- token lifecycle ------------------------------------------------------

    def issue_confirmation(self, task_id: str, action: CandidateAction) -> ConfirmationTicket:
        tok = token_for(task_id, action.id, action.parameters)
        self._open_tokens[tok.token] = tok
        return tok

    def expire(self, token: str) -> None:
        """过期/撤销：token 立即不可重放。"""
        self._open_tokens.pop(token, None)

    # -- authorization --------------------------------------------------------

    def _match_scope(self, action: CandidateAction) -> bool:
        if not self.allowed_scopes:
            return True
        target = str(action.parameters.get("path") or action.parameters.get("target") or "")
        if not target:
            return False
        return any(target.startswith(s) for s in self.allowed_scopes)

    def authorize(
        self,
        task_id: str,
        action: CandidateAction,
        confirmation_token: str | None,
    ) -> AuthorizationOutcome:
        # 1. user rules — hard, cannot be weakened by anything below.
        verdict = self.rule_engine.check(action)
        if verdict.outcome == "blocked":
            raise PermissionDenied(
                user_message="按你设置的规则，这个操作不执行。",
                detail=f"rules {verdict.matched_rules}: {verdict.reason}",
            )

        # 2. workspace scope.
        if not self._match_scope(action):
            raise PermissionDenied(
                user_message="这个操作超出了你授权的范围，没有执行。",
                detail=f"target outside allowed scopes {self.allowed_scopes}",
            )

        # 3. risk level — high-risk kinds need a token, always.
        if is_high_risk(action) or verdict.outcome == "require_confirmation":
            if not confirmation_token:
                raise PermissionDenied(
                    user_message="这一步需要你确认后才能进行。",
                    detail="high-risk or rule-required confirmation without token",
                )

        # 4. token binding — exact action, exact parameters, single use.
        if confirmation_token:
            ticket = self._open_tokens.get(confirmation_token)
            if ticket is None:
                raise PermissionDenied(
                    user_message="这条确认已经过期或不存在，请重新确认。",
                    detail=f"token {confirmation_token!r} not open",
                )
            if ticket.task_id != task_id or ticket.action_id != action.id:
                raise PermissionDenied(
                    user_message="这条确认对应的是另一个操作，请重新确认。",
                    detail=f"token bound to {ticket.task_id}/{ticket.action_id}",
                )
            if ticket.parameters_hash != _param_hash(action.parameters):
                raise PermissionDenied(
                    user_message="操作内容在确认后发生了变化，请重新确认。",
                    detail="parameters_hash mismatch — token invalidated",
                )
            # Single use: consume on success.
            self._open_tokens.pop(confirmation_token, None)
            return AuthorizationOutcome(
                allowed=True,
                reason="user confirmed this exact action",
                rule_refs=verdict.matched_rules,
                ticket=ticket,
            )

        return AuthorizationOutcome(
            allowed=True,
            reason="no confirmation required for this action",
            rule_refs=verdict.matched_rules,
        )
