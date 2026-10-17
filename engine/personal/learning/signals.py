"""P7.1 — behavior signals.

记录用户对系统建议的反应（accepted/edited/rejected/revoked/
repeated_correction），作为后续「学习提案」的唯一输入。设计约束（P7.1 验收）：

1. 修改前后的 action 和文本 diff 都要保存，但正文必须先脱敏。
2. 高敏感信息只保存事件类型，不保存原文、不保存 diff 的正文。
3. 每个事件都关联 task、trace、evidence，保证「一次用户修改可以完整追溯
   到原任务」。
4. 学习层只写学习事件，绝不改任务/规则/权限——那要经过 P7.2/P7.3 的提案、
   批准和回归检查。
"""

from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass, field
from typing import Any, Mapping

SIGNAL_EVENTS = frozenset({
    "accepted", "edited", "rejected", "revoked", "repeated_correction",
})

SENSITIVITIES = frozenset({"normal", "sensitive", "high"})

# 身份证号、银行卡号、手机号、邮箱——先做结构化脱敏。
_PATTERNS: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("id_number", re.compile(r"\d{17}[\dXx]|\d{15}")),
    ("bank_account", re.compile(r"\b\d{16,19}\b")),
    ("phone", re.compile(r"\b1[3-9]\d{9}\b")),
    ("email", re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")),
)

# 字段名命中即整体脱敏（与 rules.SENSITIVE_KEYS 保持一致，外加中文键）。
_SENSITIVE_FIELD_KEYS = frozenset({
    "salary", "id_number", "phone", "address", "bank_account",
    "password", "secret", "身份证", "工资", "银行", "密码", "住址",
})

REDACTED = "<redacted>"


def redact_text(text: str) -> str:
    """脱敏自由文本：结构化号码替换为 <redacted>，其余保持不变。"""
    out = text
    for _, pattern in _PATTERNS:
        out = pattern.sub(REDACTED, out)
    return out


def redact_value(value: Any) -> Any:
    """递归脱敏任意 JSON 结构。敏感字段名整值替换；文本走 redact_text。"""
    if isinstance(value, Mapping):
        return {
            k: REDACTED if str(k).lower() in _SENSITIVE_FIELD_KEYS else redact_value(v)
            for k, v in value.items()
        }
    if isinstance(value, (list, tuple)):
        return [redact_value(v) for v in value]
    if isinstance(value, str):
        return redact_text(value)
    return value


def _canonical(value: Any) -> str:
    return json.dumps(value, sort_keys=True, ensure_ascii=False)


def _diff(old: Any, new: Any) -> dict[str, Any]:
    """前后差异只保留变化键（旧值同样脱敏）。

    先整体脱敏再比较：敏感字段脱敏后恒为 <redacted>，无法区分是否变化，因此
    从 diff 中剔除——不泄露「敏感字段是否变化」。自由文本 diff 返回前后脱敏值。
    """
    if not (isinstance(old, Mapping) and isinstance(new, Mapping)):
        return {"before": redact_value(old), "after": redact_value(new)}
    old_red, new_red = redact_value(old), redact_value(new)
    changed: dict[str, Any] = {}
    for key in sorted(set(old_red) | set(new_red)):
        before, after = old_red.get(key), new_red.get(key)
        if before == after or before == REDACTED or after == REDACTED:
            continue
        changed[str(key)] = {"before": before, "after": after}
    return changed


@dataclass(frozen=True)
class BehaviorSignal:
    event_id: str
    event: str
    task_id: str
    trace_id: str
    evidence_ids: tuple[str, ...]
    sensitivity: str = "normal"
    before: Any = None
    after: Any = None
    diff: dict[str, Any] = field(default_factory=dict)
    recorded_at: str = ""

    def __post_init__(self) -> None:
        if self.event not in SIGNAL_EVENTS:
            raise ValueError(f"未知的学习事件类型：{self.event}")
        if self.sensitivity not in SENSITIVITIES:
            raise ValueError(f"未知的敏感级别：{self.sensitivity}")
        if not self.task_id or not self.trace_id:
            raise ValueError("学习事件必须关联 task 和 trace")
        if not self.evidence_ids:
            raise ValueError("学习事件必须关联至少一条 evidence")

    @property
    def stores_content(self) -> bool:
        """高敏感只存事件类型——不存 before/after/diff 的正文。"""
        return self.sensitivity != "high"

    def to_dict(self) -> dict[str, Any]:
        base: dict[str, Any] = {
            "schema_version": 1,
            "event_id": self.event_id,
            "event": self.event,
            "task_id": self.task_id,
            "trace_id": self.trace_id,
            "evidence_ids": list(self.evidence_ids),
            "sensitivity": self.sensitivity,
            "content_redacted": self.sensitivity == "high",
            "recorded_at": self.recorded_at,
        }
        if self.stores_content:
            base["before"] = self.before
            base["after"] = self.after
            base["diff"] = self.diff
        return base


class BehaviorSignalRecorder:
    """收集行为信号；写入前统一脱敏。不直接触碰任务或规则。"""

    def __init__(self, sink: Any | None = None) -> None:
        self._signals: list[BehaviorSignal] = []
        self._sink = sink

    def record(
        self,
        *,
        event: str,
        task_id: str,
        trace_id: str,
        evidence_ids: list[str] | tuple[str, ...],
        sensitivity: str = "normal",
        before: Any = None,
        after: Any = None,
        recorded_at: str = "",
    ) -> BehaviorSignal:
        if sensitivity == "high":
            safe_before, safe_after, diff = None, None, {}
        else:
            safe_before = redact_value(before)
            safe_after = redact_value(after)
            diff = {} if event == "accepted" else _diff(before, after)
        event_id = "sig_" + hashlib.sha256(
            _canonical([event, task_id, trace_id, list(evidence_ids), recorded_at]).encode()
        ).hexdigest()[:16]
        signal = BehaviorSignal(
            event_id=event_id,
            event=event,
            task_id=task_id,
            trace_id=trace_id,
            evidence_ids=tuple(evidence_ids),
            sensitivity=sensitivity,
            before=safe_before,
            after=safe_after,
            diff=diff,
            recorded_at=recorded_at,
        )
        self._signals.append(signal)
        if self._sink is not None:
            self._sink(signal.to_dict())
        return signal

    def record_correction(
        self, *, task_id: str, trace_id: str, evidence_ids: list[str],
        original: Any, corrected: Any, sensitivity: str = "normal",
        repeated: bool = False, recorded_at: str = "",
    ) -> BehaviorSignal:
        """用户改写了系统建议：记录 before/after；同一任务重复改写时标为
        repeated_correction（P7.2 只把重复且一致的行为升级为候选规则）。"""
        return self.record(
            event="repeated_correction" if repeated else "edited",
            task_id=task_id, trace_id=trace_id, evidence_ids=evidence_ids,
            sensitivity=sensitivity, before=original, after=corrected,
            recorded_at=recorded_at,
        )

    @property
    def signals(self) -> tuple[BehaviorSignal, ...]:
        return tuple(self._signals)

    def count(self, event: str) -> int:
        return sum(1 for s in self._signals if s.event == event)
