"""P7.2 — learning proposals.

只把「重复且一致」的行为升级为候选规则；单次拒绝绝不推断长期偏好。
每条提案展示例子、影响范围、反例与风险；高敏感规则必须人工批准；
规则默认 proposed，不直接 active。

验收：用户能看到「为什么建议这条规则」，并能拒绝而不影响任务。
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from typing import Any, Mapping

from .signals import BehaviorSignal, REDACTED

# 默认只有 proposed；人工批准后由 P7.3 的版本层改为 approved/applied。
DEFAULT_STATUS = "proposed"

# 触发候选规则的最少重复次数（重复且一致）。
MIN_REPEAT = 2

# 高敏感信号生成的规则必须人工批准，且绝不进入默认提案（要单独展示）。
HIGH_SENSITIVITY_NEEDS_APPROVAL = True


def _canonical(value: Any) -> str:
    return json.dumps(value, sort_keys=True, ensure_ascii=False)


def _stable_id(*parts: Any) -> str:
    h = hashlib.sha256(_canonical(list(parts)).encode()).hexdigest()
    return "prop_" + h[:16]


@dataclass(frozen=True)
class RuleProposal:
    """一条候选规则提案：展示给用户的全部理由。"""

    proposal_id: str
    status: str                     # 固定 DEFAULT_STATUS
    rule: dict[str, Any]            # when/then/priority/scope
    summary: str
    examples: tuple[str, ...]       # 触发该规则的信号示例（脱敏）
    scope: tuple[str, ...]          # 影响范围
    counterexamples: tuple[str, ...]  # 反例：为什么不能过度推广
    risk: str
    sensitivity: str
    supporting_trace_refs: tuple[str, ...]
    created_at: str = ""

    def __post_init__(self) -> None:
        if self.status != DEFAULT_STATUS:
            raise ValueError(f"候选规则默认必须是 {DEFAULT_STATUS}，得到 {self.status}")

    def to_dict(self) -> dict[str, Any]:
        return {
            "schema_version": 1,
            "proposal_id": self.proposal_id,
            "status": self.status,
            "rule": self.rule,
            "summary": self.summary,
            "examples": list(self.examples),
            "scope": list(self.scope),
            "counterexamples": list(self.counterexamples),
            "risk": self.risk,
            "sensitivity": self.sensitivity,
            "supporting_trace_refs": list(self.supporting_trace_refs),
            "created_at": self.created_at,
        }


def _signal_is_repeatable(sig: BehaviorSignal) -> bool:
    """高敏感信号从不自动进入提案；且必须有可用的 diff。"""
    if sig.sensitivity == "high":
        return False
    if sig.event not in {"edited", "repeated_correction", "rejected", "revoked"}:
        return False
    return bool(sig.diff)


def _describe_field_change(sig: BehaviorSignal) -> dict[str, Any] | None:
    """把一次 diff 抽成一条「对某个字段/动作的一次修正」。"""
    changed = []
    for key, change in sig.diff.items():
        if not isinstance(change, Mapping):
            continue
        after = change.get("after")
        if after is None or after == REDACTED:
            continue
        changed.append({"key": key, "after": after})
    if not changed:
        return None
    return {
        "task_id": sig.task_id,
        "trace_id": sig.trace_id,
        "evidence_ids": list(sig.evidence_ids),
        "changes": changed,
    }


class Proposer:
    """把重复且一致的行为信号聚类成候选规则。"""

    def __init__(self) -> None:
        self._candidates: list[RuleProposal] = []

    def propose(self, signals: list[BehaviorSignal] | tuple[BehaviorSignal, ...]) -> list[RuleProposal]:
        """输入一批信号，输出候选规则。单次行为/不一致行为不会被聚类。"""
        repeatable = [s for s in signals if _signal_is_repeatable(s)]
        normalized: dict[str, list[dict[str, Any]]] = {}
        for sig in repeatable:
            desc = _describe_field_change(sig)
            if desc is None:
                continue
            # 以「字段 + 修改后的值」为一致键：同一字段改成同一新值才算一致。
            for change in desc["changes"]:
                key = _canonical([change["key"], change["after"]])
                normalized.setdefault(key, []).append(
                    {**desc, "sensitivity": sig.sensitivity, "event": sig.event}
                )

        candidates: list[RuleProposal] = []
        for key, group in normalized.items():
            if len(group) < MIN_REPEAT:
                continue  # 单次行为不推断长期偏好。
            rule_meta = json.loads(key)
            rule = self._build_rule(rule_meta[0], rule_meta[1])
            sensitivity = "high" if any(g["sensitivity"] == "high" for g in group) else "normal"
            examples = tuple(
                f"第{n}次：把「{rule_meta[0]}」改成「{rule_meta[1]}」（来自 {g['trace_id']}）"
                for n, g in enumerate(group[:3], 1)
            )
            counterexamples = (
                "不同任务改成了不同值，不能一概而用",
            )
            candidates.append(
                RuleProposal(
                    proposal_id=_stable_id("rule", *rule_meta),
                    status=DEFAULT_STATUS,
                    rule=rule,
                    summary=f"多次把「{rule_meta[0]}」统一改成「{rule_meta[1]}」",
                    examples=examples,
                    scope=tuple({g["task_id"] for g in group}),
                    counterexamples=counterexamples,
                    risk="高敏感，必须人工批准" if sensitivity == "high" else "低风险，可先试用",
                    sensitivity=sensitivity,
                    supporting_trace_refs=tuple({g["trace_id"] for g in group}),
                )
            )
        self._candidates.extend(candidates)
        return candidates

    def _build_rule(self, field_key: str, target_value: Any) -> dict[str, Any]:
        """由一致修正生成一条 when/then 规则：命中该字段时采用新值。"""
        return {
            "when": {"field": field_key},
            "then": {"value": target_value},
            "priority": 0,
            "source": "user_approved_learning",
            "status": DEFAULT_STATUS,
        }

    @property
    def candidates(self) -> tuple[RuleProposal, ...]:
        return tuple(self._candidates)