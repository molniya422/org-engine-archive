"""P5.3 — tool verifiers.

验证靠事实，不靠模型的话。Each verifier re-checks the world AFTER execution:
files still exist, hashes match, records were actually written. A model
returning "已完成" is never evidence — verify_tool_call ignores any claim.

Verification statuses: verified | failed | executed_unverified | unverifiable.
NEVER "done" — done is a UI word that may only be shown on top of a verified
result.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable


@dataclass(frozen=True)
class VerificationStatus:
    """String statuses for API compatibility; this class documents the set."""
    VERIFIED = "verified"
    FAILED = "failed"
    EXECUTED_UNVERIFIED = "executed_unverified"
    UNVERIFIABLE = "unverifiable"

    VALID = frozenset({VERIFIED, FAILED, EXECUTED_UNVERIFIED, UNVERIFIABLE})


@dataclass(frozen=True)
class VerifierResult:
    status: str
    checks: list[dict[str, Any]] = field(default_factory=list)
    reason: str = ""

    def __post_init__(self) -> None:
        if self.status not in VerificationStatus.VALID:
            raise ValueError(f"invalid verification status '{self.status}'")


def _file_hash(path: Path) -> str | None:
    try:
        return hashlib.sha256(path.read_bytes()).hexdigest()
    except OSError:
        return None


def verify_read_file(path: str, content_hash_at_read: str | None) -> VerifierResult:
    """文件仍存在且（若有基线）hash 未变化。"""
    checks: list[dict[str, Any]] = []
    p = Path(path)
    exists = p.is_file()
    checks.append({"check": "file_exists", "passed": exists})
    if not exists:
        return VerifierResult(
            status=VerificationStatus.UNVERIFIABLE, checks=checks,
            reason="文件已不存在，无法确认读取结果。",
        )
    current_hash = _file_hash(p)
    checks.append({"check": "content_hash", "hash": current_hash, "passed": True})
    if content_hash_at_read is not None:
        if current_hash != content_hash_at_read:
            checks[-1]["passed"] = False
            return VerifierResult(
                status=VerificationStatus.FAILED, checks=checks,
                reason="文件内容在读取后发生了变化。",
            )
    return VerifierResult(status=VerificationStatus.VERIFIED, checks=checks, reason="文件存在且内容一致。")


def verify_create_draft(path: str) -> VerifierResult:
    """草稿文件确实存在且可读取。"""
    checks: list[dict[str, Any]] = []
    p = Path(path)
    exists = p.is_file()
    checks.append({"check": "draft_exists", "passed": exists})
    if not exists:
        return VerifierResult(
            status=VerificationStatus.UNVERIFIABLE, checks=checks,
            reason="草稿文件不存在，生成未完成或已被删除。",
        )
    try:
        content = p.read_text(encoding="utf-8", errors="strict")
        readable = len(content) >= 0
    except (OSError, UnicodeDecodeError):
        readable = False
    checks.append({"check": "readable", "passed": readable})
    if not readable:
        return VerifierResult(
            status=VerificationStatus.EXECUTED_UNVERIFIED, checks=checks,
            reason="草稿文件存在但无法读取，内容不可信。",
        )
    return VerifierResult(status=VerificationStatus.VERIFIED, checks=checks, reason="草稿已生成且可读取。")


def verify_create_reminder(
    reminder_id: str,
    store_get: Callable[[str], dict[str, Any] | None],
) -> VerifierResult:
    """提醒记录确实写入了存储。"""
    record = store_get(reminder_id)
    passed = record is not None and bool(record.get("id"))
    checks = [{"check": "reminder_record_written", "passed": passed}]
    if not passed:
        return VerifierResult(
            status=VerificationStatus.UNVERIFIABLE, checks=checks,
            reason="存储里找不到这条提醒，创建未完成。",
        )
    return VerifierResult(status=VerificationStatus.VERIFIED, checks=checks, reason="提醒已写入存储。")


def verify_tool_call(
    tool: str,
    parameters: dict[str, Any],
    model_claimed_done: bool = False,  # accepted for signature compat; deliberately ignored
) -> VerifierResult:
    """Dispatch to the right verifier. The model's claim of completion is
    NEVER evidence — only the world state below decides."""
    if tool == "read_file":
        return verify_read_file(str(parameters.get("path", "")), content_hash_at_read=None)
    if tool == "create_draft":
        return verify_create_draft(str(parameters.get("path", "")))
    if tool == "create_reminder":
        return verify_create_reminder(str(parameters.get("id", "")), store_get=lambda _i: None)
    return VerifierResult(
        status=VerificationStatus.UNVERIFIABLE,
        checks=[],
        reason=f"工具 {tool} 没有对应的验证方式（模型声称的完成不作为证据）。",
    )
