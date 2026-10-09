"""P1.3 Python twin of the evidence service.

Same four rules and identical field names as
editor/backend-server/src/personal/evidence.ts:

1. File evidence -> workspace-relative locator only; absolute or escaping
   paths raise EvidenceRuleError.
2. Tool results -> summary hash + capture time + sensitivity.
3. User statements -> kind is always "user_statement"; no upgrade path exists.
4. Chain query -> evidence supporting a ref is queryable.

Uses engine.personal.protocols.octop-style pure functions plus a tiny
in-memory repository so tests run without a database dependency. The TS side
persists through PersonalStore; this twin is consumed by the engine pipeline
where persistence happens via versioned envelopes instead of direct DB writes.
"""

from __future__ import annotations

import hashlib
import json
import re
import unittest
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath


class EvidenceRuleError(ValueError):
    """Raised when evidence rules are violated (absolute path, escaping path)."""


def _sha256_hex(data: str) -> str:
    return "sha256:" + hashlib.sha256(data.encode("utf-8")).hexdigest()


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def to_workspace_locator(workspace_root: Path, raw_path: str) -> str:
    """Normalize to a workspace-relative POSIX path; reject anything outside."""
    if re.match(r"^[A-Za-z]:[\\/]", raw_path) or raw_path.startswith("/"):
        raise EvidenceRuleError(
            f"file evidence must use a workspace-relative path, got absolute: {raw_path}"
        )
    candidate = (workspace_root / raw_path).resolve()
    root = workspace_root.resolve()
    try:
        rel = candidate.relative_to(root)
    except ValueError:
        raise EvidenceRuleError(f"file evidence path escapes the workspace: {raw_path}")
    return str(PurePosixPath(rel))


@dataclass
class EvidenceRecord:
    schema_version: int
    id: str
    kind: str  # file | tool_result | user_statement | execution_receipt | verification
    locator: str
    content_hash: str
    captured_at: str
    sensitivity: str  # normal | sensitive | high
    supports: list[str] = field(default_factory=list)


class EvidenceRepository:
    """In-memory twin. Records are append-only; kind is immutable by design."""

    def __init__(self, workspace_root: Path):
        self.workspace_root = workspace_root
        self._records: dict[str, EvidenceRecord] = {}
        self._counter = 0

    def _next_id(self, prefix: str) -> str:
        self._counter += 1
        return f"evidence_{prefix}_{self._counter:06d}"

    def from_file(self, relative_path: str, sensitivity: str = "normal",
                  supports: list[str] | None = None) -> EvidenceRecord:
        locator = to_workspace_locator(self.workspace_root, relative_path)
        target = self.workspace_root / Path(*PurePosixPath(locator).parts)
        if not target.is_file():
            raise EvidenceRuleError(f"cannot hash file evidence {locator}: not a file")
        content = target.read_text(encoding="utf-8")
        rec = EvidenceRecord(
            schema_version=1,
            id=self._next_id("file"),
            kind="file",
            locator=locator,
            content_hash=_sha256_hex(locator + content),
            captured_at=_now_iso(),
            sensitivity=sensitivity,
            supports=supports or [],
        )
        self._records[rec.id] = rec
        return rec

    def from_tool_result(self, tool_name: str, summary, sensitivity: str = "normal",
                         supports: list[str] | None = None) -> EvidenceRecord:
        serialized = json.dumps(summary, ensure_ascii=False, sort_keys=True)
        rec = EvidenceRecord(
            schema_version=1,
            id=self._next_id("tool"),
            kind="tool_result",
            locator=f"tool://{tool_name}",
            content_hash=_sha256_hex(serialized),
            captured_at=_now_iso(),
            sensitivity=sensitivity,
            supports=supports or [],
        )
        self._records[rec.id] = rec
        return rec

    def from_user_statement(self, conversation_id: str, utterance: str,
                            supports: list[str] | None = None) -> EvidenceRecord:
        rec = EvidenceRecord(
            schema_version=1,
            id=self._next_id("user"),
            kind="user_statement",
            locator=f"conversation://{conversation_id}",
            content_hash=_sha256_hex(utterance),
            captured_at=_now_iso(),
            sensitivity="normal",
            supports=supports or [],
        )
        self._records[rec.id] = rec
        return rec

    def get(self, evidence_id: str) -> EvidenceRecord | None:
        return self._records.get(evidence_id)

    def chain(self, ref_id: str) -> list[EvidenceRecord]:
        return [r for r in self._records.values() if ref_id in r.supports]

    def upgrade_kind(self, evidence_id: str, new_kind: str) -> None:
        """Deliberately absent in TS; present here only to prove it refuses."""
        raise EvidenceRuleError("evidence kind can never be upgraded")


class TestEvidenceRules(unittest.TestCase):
    def setUp(self):
        import tempfile

        self._tmp = tempfile.TemporaryDirectory()
        self.workspace = Path(self._tmp.name) / "workspace"
        (self.workspace / "inbox").mkdir(parents=True)
        (self.workspace / "inbox" / "a.pdf").write_text("A4 报销单，3 页扫描", encoding="utf-8")
        self.repo = EvidenceRepository(self.workspace)

    def tearDown(self):
        self._tmp.cleanup()

    def test_rule1_relative_locator_and_hash(self):
        rec = self.repo.from_file("inbox/a.pdf")
        self.assertEqual(rec.kind, "file")
        self.assertEqual(rec.locator, "inbox/a.pdf")
        self.assertRegex(rec.content_hash, r"^sha256:[0-9a-f]{64}$")

    def test_rule1_rejects_absolute_and_escape(self):
        with self.assertRaises(EvidenceRuleError):
            self.repo.from_file("D:\\secrets\\salary.pdf")
        with self.assertRaises(EvidenceRuleError):
            self.repo.from_file("/etc/passwd")
        with self.assertRaises(EvidenceRuleError):
            self.repo.from_file("../outside.txt")

    def test_rule2_tool_result_fields(self):
        rec = self.repo.from_tool_result("read_file", {"pages": 3}, sensitivity="sensitive")
        self.assertEqual(rec.kind, "tool_result")
        self.assertEqual(rec.locator, "tool://read_file")
        self.assertRegex(rec.content_hash, r"^sha256:[0-9a-f]{64}$")
        self.assertRegex(rec.captured_at, r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$")
        self.assertEqual(rec.sensitivity, "sensitive")

    def test_rule3_user_statement_immutable(self):
        rec = self.repo.from_user_statement("conv_01", "我每周五去健身房")
        self.assertEqual(rec.kind, "user_statement")
        with self.assertRaises(EvidenceRuleError):
            self.repo.upgrade_kind(rec.id, "tool_result")

    def test_rule4_chain_query(self):
        self.repo.from_file("inbox/a.pdf", supports=["fact_01"])
        self.repo.from_user_statement("conv_01", "无关的话")
        chain = self.repo.chain("fact_01")
        self.assertEqual(len(chain), 1)
        self.assertEqual(chain[0].locator, "inbox/a.pdf")


if __name__ == "__main__":
    unittest.main()
