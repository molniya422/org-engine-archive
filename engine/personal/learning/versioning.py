"""P7.3 — versioning and rollback.

为事实（facts）、规则（rules）、policy 和提示模板（prompts）保存版本。
应用学习提案生成 immutable version；回归集通过后才允许启用；回滚恢复
旧版本并保留审计事件；回滚后重新执行同一任务时使用旧版本。

验收：批准、应用、回滚三个状态在刷新和重启后都保持一致（通过
snapshot()/from_snapshot() 持久化语义测试；落盘由后端 learning 版本表负责）。
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, replace
from typing import Any, Callable, Mapping

VERSION_KINDS = frozenset({"facts", "rules", "policy", "prompts"})

# 版本状态：applied(已生成，待回归) → enabled(回归通过后启用) /
# superseded(被新版本替代) / rolled_back(被回滚撤销)。
VERSION_STATUSES = frozenset({"applied", "enabled", "superseded", "rolled_back"})


class VersionError(Exception):
    """版本操作违反约束（种类未知、状态非法、回归未通过等）。"""


def _canonical(value: Any) -> str:
    return json.dumps(value, sort_keys=True, ensure_ascii=False)


@dataclass(frozen=True)
class ConfigVersion:
    """一条不可变配置版本。content 永不修改；状态流转只产生审计事件。"""

    version_id: str
    kind: str
    seq: int                          # kind 内单调递增
    content: Mapping[str, Any]
    proposal_id: str                  # 来源提案
    status: str
    eval_report: str                  # 启用时的回归结论（passed/failed）
    created_at: str

    def __post_init__(self) -> None:
        if self.kind not in VERSION_KINDS:
            raise VersionError(f"未知的版本种类：{self.kind}")
        if self.status not in VERSION_STATUSES:
            raise VersionError(f"未知的版本状态：{self.status}")

    def to_dict(self) -> dict[str, Any]:
        return {
            "schema_version": 1,
            "version_id": self.version_id,
            "kind": self.kind,
            "seq": self.seq,
            "content": dict(self.content),
            "proposal_id": self.proposal_id,
            "status": self.status,
            "eval_report": self.eval_report,
            "created_at": self.created_at,
        }


class VersionLedger:
    """追加式版本账本：应用生成版本，回归通过才启用，回滚换回旧版本。

    content 不可变：同一 version_id 的内容永远一致，重启后从 snapshot 恢复
    也得到同样的版本序列。
    """

    def __init__(self, audit_sink: Callable[[dict[str, Any]], None] | None = None) -> None:
        self._versions: list[ConfigVersion] = []      # 全量追加，不删除
        self._audit = audit_sink
        self._seq = 0

    # -- 内部工具 ------------------------------------------------------------

    def _log(self, event: str, version: ConfigVersion, extra: dict[str, Any] | None = None) -> None:
        if self._audit is not None:
            self._audit({
                "event": event,
                "version_id": version.version_id,
                "kind": version.kind,
                "seq": version.seq,
                "status": version.status,
                **(extra or {}),
            })

    def _current(self, records: list[ConfigVersion]) -> ConfigVersion | None:
        for v in reversed(records):
            if v.status == "enabled":
                return v
        return None

    def _by_kind(self, kind: str) -> list[ConfigVersion]:
        return [v for v in self._versions if v.kind == kind]

    # -- 应用 / 启用 / 回滚 -------------------------------------------------

    def apply(
        self, *, kind: str, content: Mapping[str, Any], proposal_id: str,
        created_at: str = "",
    ) -> ConfigVersion:
        """应用学习提案：生成一条 immutable version，状态 applied（未启用）。"""
        self._seq += 1
        version_id = "ver_" + hashlib.sha256(
            _canonical([kind, self._seq, dict(content), proposal_id]).encode()
        ).hexdigest()[:16]
        version = ConfigVersion(
            version_id=version_id, kind=kind, seq=self._seq,
            content=dict(content), proposal_id=proposal_id,
            status="applied", eval_report="", created_at=created_at,
        )
        self._versions.append(version)
        self._log("version.applied", version, {"proposal_id": proposal_id})
        return version

    def enable(self, version_id: str, *, eval_passed: bool, eval_report: str = "") -> ConfigVersion:
        """回归集通过后才允许启用；未通过直接拒绝，版本保持 applied。"""
        version = self._find(version_id)
        if version.status != "applied":
            raise VersionError(f"只有 applied 状态可以启用，当前为 {version.status}")
        if not eval_passed:
            self._log("version.enable_refused", version, {"eval_report": eval_report})
            raise VersionError("回归集通过后才允许启用")
        previous = self._current(self._by_kind(version.kind))
        enabled = replace(version, status="enabled", eval_report=eval_report or "passed")
        self._swap(version, enabled)
        if previous is not None:
            self._swap(previous, replace(previous, status="superseded"))
        self._log("version.enabled", enabled, {"superseded": previous.version_id if previous else None})
        return enabled

    def rollback(self, kind: str) -> ConfigVersion:
        """回滚：当前启用版本标记 rolled_back，恢复被它替代的旧版本。

        审计事件保留在账本里；回滚后 active(kind) 返回旧版本内容，
        重新执行同一任务时使用的就是旧版本。
        """
        records = self._by_kind(kind)
        current = self._current(records)
        if current is None:
            raise VersionError(f"{kind} 没有可回滚的启用版本")
        history_enabled = [v for v in records if v.status in {"superseded", "rolled_back"}]
        if not history_enabled:
            raise VersionError(f"{kind} 没有可恢复的旧版本")
        restore = history_enabled[-1]
        self._swap(current, replace(current, status="rolled_back"))
        restored = replace(restore, status="enabled")
        self._swap(restore, restored)
        self._log("version.rolled_back", current, {"restored": restored.version_id})
        self._log("version.restored", restored, {"from_rollback": current.version_id})
        return restored

    # -- 查询 / 持久化 -------------------------------------------------------

    def _find(self, version_id: str) -> ConfigVersion:
        for v in self._versions:
            if v.version_id == version_id:
                return v
        raise VersionError(f"未找到版本：{version_id}")

    def _swap(self, old: ConfigVersion, new: ConfigVersion) -> None:
        idx = self._versions.index(old)
        self._versions[idx] = new

    def active(self, kind: str) -> ConfigVersion | None:
        """当前启用版本；回滚后返回恢复的旧版本。"""
        return self._current(self._by_kind(kind))

    def history(self, kind: str) -> tuple[ConfigVersion, ...]:
        return tuple(self._by_kind(kind))

    def snapshot(self) -> list[dict[str, Any]]:
        """序列化全部版本记录（用于持久化/重启恢复）。"""
        return [v.to_dict() for v in self._versions]

    @classmethod
    def from_snapshot(
        cls, records: list[dict[str, Any]],
        audit_sink: Callable[[dict[str, Any]], None] | None = None,
    ) -> "VersionLedger":
        """从快照恢复账本：批准、应用、回滚状态与重启前完全一致。"""
        ledger = cls(audit_sink=audit_sink)
        for rec in records:
            version = ConfigVersion(
                version_id=rec["version_id"], kind=rec["kind"], seq=int(rec["seq"]),
                content=dict(rec["content"]), proposal_id=rec["proposal_id"],
                status=rec["status"], eval_report=rec.get("eval_report", ""),
                created_at=rec.get("created_at", ""),
            )
            ledger._versions.append(version)
            ledger._seq = max(ledger._seq, version.seq)
        return ledger
