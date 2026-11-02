"""P4.1 — envelope types for the editor-backend ↔ Python-engine bridge.

Data sovereignty rules encoded in the types themselves:

- TaskEnvelope carries ONLY the task contract, redacted state, evidence
  references, and an execution budget. Raw sensitive parameters never cross.
- Python returns PlanEnvelope / ExecutionEvent / VerificationEnvelope. The
  engine has NO storage handle — it cannot write SQLite; the TS side owns
  persistence.
- contract_version bumps when the user changes conditions; a version change
  invalidates old plans and historical execution events can never be
  completion evidence for a new contract version.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

REQUIRED_TASK_FIELDS = (
    "contract_version", "policy_version", "trace_id", "task_id",
    "intent_id", "conversation_id", "goal", "redacted_state",
    "evidence_refs", "budget",
)

VERIFICATION_STATUSES = frozenset({"verified", "failed", "incomplete", "unverifiable"})

# 联网策略：默认关闭。旧任务不带该字段时必须继承"禁止"，绝不能因为新代码
# 默认值变化而让历史任务获得联网能力。
NETWORK_MODES = frozenset({"deny", "ask", "allow"})
QUERY_DATA_CLASSES = frozenset({"public_only", "redacted_local", "private_forbidden"})

DEFAULT_NETWORK_POLICY: dict[str, Any] = {
    "enabled": False,
    "mode": "deny",
    "providers": [],
    "allowed_domains": [],
    "query_data_class": "public_only",
    "max_results": 5,
    "recency": None,
}


def normalize_network_policy(raw: Any) -> dict[str, Any]:
    """校验并规范化 network_policy；缺省 → 默认拒绝。

    未知 mode/data_class 直接 ValueError（不静默降级成"允许"）。
    """
    if raw is None:
        return dict(DEFAULT_NETWORK_POLICY)
    if not isinstance(raw, dict):
        raise ValueError("network_policy must be an object")
    mode = raw.get("mode", "deny")
    if mode not in NETWORK_MODES:
        raise ValueError(f"network_policy.mode must be one of {sorted(NETWORK_MODES)}, got {mode!r}")
    data_class = raw.get("query_data_class", "public_only")
    if data_class not in QUERY_DATA_CLASSES:
        raise ValueError(
            f"network_policy.query_data_class must be one of {sorted(QUERY_DATA_CLASSES)}, got {data_class!r}"
        )
    providers = raw.get("providers", [])
    domains = raw.get("allowed_domains", [])
    if not isinstance(providers, list) or not all(isinstance(p, str) for p in providers):
        raise ValueError("network_policy.providers must be a list of strings")
    if not isinstance(domains, list) or not all(isinstance(d, str) for d in domains):
        raise ValueError("network_policy.allowed_domains must be a list of strings")
    max_results = raw.get("max_results", 5)
    if not isinstance(max_results, int) or isinstance(max_results, bool) or not 1 <= max_results <= 50:
        raise ValueError("network_policy.max_results must be an integer in 1..50")
    return {
        "enabled": bool(raw.get("enabled", False)),
        "mode": mode,
        "providers": list(providers),
        "allowed_domains": list(domains),
        "query_data_class": data_class,
        "max_results": max_results,
        "recency": raw.get("recency"),
    }


def bump_contract_version(task_dict: dict[str, Any]) -> int:
    """用户修改条件 → 合同版本 +1 → 受影响计划重新进入判断流程。"""
    return int(task_dict.get("contract_version", 0)) + 1


def contract_version_of(task_dict: dict[str, Any]) -> int:
    return int(task_dict.get("contract_version", 0))


@dataclass(frozen=True)
class TaskEnvelope:
    """editor backend → Python engine. Only what the engine may see."""
    contract_version: int
    policy_version: str
    trace_id: str
    task_id: str
    intent_id: str
    conversation_id: str
    goal: str
    redacted_state: dict[str, Any] = field(default_factory=dict)
    evidence_refs: tuple[str, ...] = ()
    budget: dict[str, Any] = field(default_factory=dict)
    allowed_scopes: tuple[str, ...] = ()
    forbidden_actions: tuple[str, ...] = ()
    # 合同里用户声明的确认点：非空即要求执行前先确认（即使候选只是低风险草稿）。
    confirmation_points: tuple[dict[str, Any], ...] = ()
    network_policy: dict[str, Any] = field(default_factory=lambda: dict(DEFAULT_NETWORK_POLICY))

    def to_dict(self) -> dict[str, Any]:
        return {
            "contract_version": self.contract_version,
            "policy_version": self.policy_version,
            "trace_id": self.trace_id,
            "task_id": self.task_id,
            "intent_id": self.intent_id,
            "conversation_id": self.conversation_id,
            "goal": self.goal,
            "redacted_state": self.redacted_state,
            "evidence_refs": list(self.evidence_refs),
            "budget": self.budget,
            "allowed_scopes": list(self.allowed_scopes),
            "forbidden_actions": list(self.forbidden_actions),
            "confirmation_points": [dict(p) for p in self.confirmation_points],
            "network_policy": normalize_network_policy(self.network_policy),
        }

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> "TaskEnvelope":
        missing = [k for k in REQUIRED_TASK_FIELDS if k not in d]
        if missing:
            raise ValueError(f"TaskEnvelope missing required fields: {missing}")
        return cls(
            contract_version=int(d["contract_version"]),
            policy_version=str(d["policy_version"]),
            trace_id=str(d["trace_id"]),
            task_id=str(d["task_id"]),
            intent_id=str(d["intent_id"]),
            conversation_id=str(d["conversation_id"]),
            goal=str(d["goal"]),
            redacted_state=dict(d["redacted_state"]),
            evidence_refs=tuple(d.get("evidence_refs", ())),
            budget=dict(d["budget"]),
            allowed_scopes=tuple(d.get("allowed_scopes", ())),
            forbidden_actions=tuple(d.get("forbidden_actions", ())),
            confirmation_points=tuple(dict(p) for p in d.get("confirmation_points", ())),
            network_policy=normalize_network_policy(d.get("network_policy")),
        )


@dataclass(frozen=True)
class PlanEnvelope:
    """Python engine → editor backend. The decision result, never execution."""
    trace_id: str
    task_id: str
    contract_version: int
    policy_version: str
    candidates: list[Any] = field(default_factory=list)   # CandidateAction dicts
    verdict: str = "policy_error"
    selected_action: str | None = None
    reason: str = ""
    missing_information: list[str] = field(default_factory=list)
    rule_refs: list[str] = field(default_factory=list)
    requires_confirmation: bool = False
    network_policy: dict[str, Any] = field(default_factory=lambda: dict(DEFAULT_NETWORK_POLICY))

    def to_dict(self) -> dict[str, Any]:
        return {
            "trace_id": self.trace_id,
            "task_id": self.task_id,
            "contract_version": self.contract_version,
            "policy_version": self.policy_version,
            "candidates": [c.to_dict() if hasattr(c, "to_dict") else dict(c) for c in self.candidates],
            "verdict": self.verdict,
            "selected_action": self.selected_action,
            "reason": self.reason,
            "missing_information": list(self.missing_information),
            "rule_refs": list(self.rule_refs),
            "requires_confirmation": self.requires_confirmation,
            "network_policy": normalize_network_policy(self.network_policy),
        }

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> "PlanEnvelope":
        from .decision_types import CandidateAction

        candidates = [
            c if isinstance(c, CandidateAction) else CandidateAction(
                id=c["id"], kind=c["kind"], risk_level=c["risk_level"],
                parameters=c.get("parameters", {}),
                expected_effect=c.get("expected_effect", ""),
                rollback=c.get("rollback", ""),
                evidence_refs=tuple(c.get("evidence_refs", ())),
                value=float(c.get("value", 0.0)),
            )
            for c in d.get("candidates", [])
        ]
        return cls(
            trace_id=str(d["trace_id"]), task_id=str(d["task_id"]),
            contract_version=int(d.get("contract_version", 0)),
            policy_version=str(d.get("policy_version", "")),
            candidates=candidates,
            verdict=str(d.get("verdict", "policy_error")),
            selected_action=d.get("selected_action"),
            reason=str(d.get("reason", "")),
            missing_information=list(d.get("missing_information", [])),
            rule_refs=list(d.get("rule_refs", [])),
            requires_confirmation=bool(d.get("requires_confirmation", False)),
            network_policy=normalize_network_policy(d.get("network_policy")),
        )


@dataclass(frozen=True)
class ExecutionEvent:
    """One step of the execution trace. Append-only, replayable."""
    trace_id: str
    task_id: str
    seq: int
    event_type: str        # action_started | action_completed | action_failed | waiting_confirmation | contract_version_mismatch
    payload: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "trace_id": self.trace_id, "task_id": self.task_id,
            "seq": self.seq, "event_type": self.event_type,
            "payload": self.payload,
        }

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> "ExecutionEvent":
        return cls(
            trace_id=str(d["trace_id"]), task_id=str(d["task_id"]),
            seq=int(d["seq"]), event_type=str(d["event_type"]),
            payload=dict(d.get("payload", {})),
        )


@dataclass(frozen=True)
class VerificationEnvelope:
    """Honest completion status. unverifiable ≠ verified."""
    trace_id: str
    task_id: str
    contract_version: int
    status: str            # verified | failed | incomplete | unverifiable
    checks: list[dict[str, Any]] = field(default_factory=list)
    reason: str = ""

    def __post_init__(self) -> None:
        if self.status not in VERIFICATION_STATUSES:
            raise ValueError(
                f"status must be one of {sorted(VERIFICATION_STATUSES)}, got '{self.status}'"
            )

    def to_dict(self) -> dict[str, Any]:
        return {
            "trace_id": self.trace_id, "task_id": self.task_id,
            "contract_version": self.contract_version, "status": self.status,
            "checks": self.checks, "reason": self.reason,
        }

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> "VerificationEnvelope":
        return cls(
            trace_id=str(d["trace_id"]), task_id=str(d["task_id"]),
            contract_version=int(d.get("contract_version", 0)),
            status=str(d["status"]), checks=list(d.get("checks", [])),
            reason=str(d.get("reason", "")),
        )
