"""P6.2 — replay records.

保存输入 envelope、状态快照、模型版本、policy 版本和 tool receipts；支持从
任一决策前节点重放。Deterministic fake provider 保证同输入同输出。回放对比
旧/新版本的动作、询问和证据。回放绝不调用真实高风险工具——一律 mocked。
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class ReplayNode:
    step: int
    event: str
    detail: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {"step": self.step, "event": self.event, "detail": self.detail}

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> "ReplayNode":
        return cls(step=int(d["step"]), event=str(d["event"]), detail=dict(d.get("detail", {})))


@dataclass(frozen=True)
class ReplayRecord:
    trace_id: str
    input_envelope: dict[str, Any]
    state_snapshot: dict[str, Any]
    model_version: str
    policy_version: str
    tool_receipts: list[dict[str, Any]]
    nodes: list[ReplayNode] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "trace_id": self.trace_id,
            "input_envelope": self.input_envelope,
            "state_snapshot": self.state_snapshot,
            "model_version": self.model_version,
            "policy_version": self.policy_version,
            "tool_receipts": self.tool_receipts,
            "nodes": [n.to_dict() for n in self.nodes],
        }

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> "ReplayRecord":
        return cls(
            trace_id=str(d["trace_id"]),
            input_envelope=dict(d["input_envelope"]),
            state_snapshot=dict(d.get("state_snapshot", {})),
            model_version=str(d["model_version"]),
            policy_version=str(d["policy_version"]),
            tool_receipts=[dict(r) for r in d.get("tool_receipts", [])],
            nodes=[ReplayNode.from_dict(n) for n in d.get("nodes", [])],
        )


def replay_from(record: ReplayRecord, from_step: int) -> list[dict[str, Any]]:
    """从 from_step 之前的节点开始重放：先回放状态快照，再执行从该节点起的
    事件序列。返回值带步骤号，可被上层按版本对比。"""
    base = [{"step": -1, "event": "state_snapshot", "detail": record.state_snapshot}]
    events = [n.to_dict() for n in record.nodes if n.step >= from_step]
    return base + events


def compare_replays(old: ReplayRecord, new: ReplayRecord) -> dict[str, Any]:
    """对比两个版本的 replay：动作、询问、证据的差异。"""
    old_actions = {
        n.step: n.detail.get("action") for n in old.nodes if n.event == "action_selected"
    }
    new_actions = {
        n.step: n.detail.get("action") for n in new.nodes if n.event == "action_selected"
    }
    action_diffs = [
        {"step": s, "old": old_actions[s], "new": new_actions[s]}
        for s in sorted(set(old_actions) | set(new_actions))
        if old_actions.get(s) != new_actions.get(s)
    ]
    old_asks = {n.step: n.detail for n in old.nodes if n.event == "ask_user"}
    new_asks = {n.step: n.detail for n in new.nodes if n.event == "ask_user"}
    ask_diffs = [
        {"step": s, "old": old_asks.get(s), "new": new_asks.get(s)}
        for s in sorted(set(old_asks) | set(new_asks))
        if old_asks.get(s) != new_asks.get(s)
    ]
    evidence_diffs = []
    if old.tool_receipts != new.tool_receipts:
        evidence_diffs = [{"old": old.tool_receipts, "new": new.tool_receipts}]
    return {
        "action_diffs": action_diffs,
        "ask_diffs": ask_diffs,
        "evidence_diffs": evidence_diffs,
        "contract_version_changed":
            old.input_envelope.get("contract_version") != new.input_envelope.get("contract_version"),
    }


class DeterministicFakeProvider:
    """Deterministic fake model: same (seed, input) → same output. High-risk
    tool calls are always mocked — receipts only, never real side effects."""

    def __init__(self, seed: str) -> None:
        self.seed = seed

    def _digest(self, payload: dict[str, Any]) -> str:
        return hashlib.sha256(
            (self.seed + json.dumps(payload, sort_keys=True, ensure_ascii=False)).encode()
        ).hexdigest()[:16]

    def generate(self, payload: dict[str, Any]) -> dict[str, Any]:
        prompt = str(payload.get("prompt", ""))
        digest = self._digest({"prompt": prompt})
        return {
            "text": f"fake({digest}): {prompt[:20]}",
            "deterministic": True,
            "seed": self.seed,
        }

    def mock_tool_calls(self, calls: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """回放里的工具调用全部被 mock：写入 receipts，绝不产生真实副作用。
        尤其高风险工具——永远 simulated_no_effect。"""
        receipts = []
        for c in calls:
            receipts.append({
                "tool": c.get("tool", "?"),
                "mocked": True,
                "status": "simulated_no_effect"
                if c.get("tool") in ("external_send", "delete", "submit", "payment")
                else "simulated_wrote",
                "parameters_hash": hashlib.sha256(
                    json.dumps(c.get("parameters", {}), sort_keys=True).encode()
                ).hexdigest(),
            })
        return receipts
