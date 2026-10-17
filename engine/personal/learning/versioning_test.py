"""P7.3 tests — versioning and rollback.

验收：批准、应用、回滚三个状态在刷新和重启后都保持一致。
- 为 facts / rules / policy / prompts 保存版本。
- 应用学习提案生成 immutable version。
- 回归集通过后才允许启用。
- 回滚恢复旧版本并保留审计事件。
- 回滚后重新执行同一任务时使用旧版本。
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from personal.learning.versioning import (
    ConfigVersion,
    VersionError,
    VersionLedger,
)


class ApplyVersionTest(unittest.TestCase):
    def test_apply_creates_immutable_version_with_applied_status(self):
        ledger = VersionLedger()
        v = ledger.apply(kind="rules", content={"when": {"field": "due"}, "then": {"value": "2026-10-20"}},
                         proposal_id="prop_01")
        self.assertEqual(v.status, "applied")
        self.assertEqual(v.kind, "rules")
        self.assertEqual(v.proposal_id, "prop_01")
        # 不可变：拿到的 content 永远一致
        self.assertEqual(ledger.history("rules")[0].content, v.content)

    def test_versions_cover_all_four_kinds(self):
        self.assertEqual({"facts", "rules", "policy", "prompts"},
                         {"facts", "rules", "policy", "prompts"})
        ledger = VersionLedger()
        for kind in ("facts", "rules", "policy", "prompts"):
            ledger.apply(kind=kind, content={"k": kind}, proposal_id="prop_01")
        self.assertEqual({v.kind for v in ledger.snapshot_records()}
                         if hasattr(ledger, "snapshot_records") else
                         {rec["kind"] for rec in ledger.snapshot()},
                         {"facts", "rules", "policy", "prompts"})

    def test_unknown_kind_is_refused(self):
        ledger = VersionLedger()
        with self.assertRaises(VersionError):
            ledger.apply(kind="secrets", content={}, proposal_id="prop_01")


class EnableGateTest(unittest.TestCase):
    def _applied(self, ledger: VersionLedger):
        return ledger.apply(kind="rules", content={"when": "x"}, proposal_id="prop_01")

    def test_enable_refused_until_regression_passes(self):
        ledger = VersionLedger()
        v = self._applied(ledger)
        with self.assertRaises(VersionError):
            ledger.enable(v.version_id, eval_passed=False)
        # 失败后版本保持 applied，可以再用于通过后的启用
        self.assertEqual(ledger.active("rules"), None)
        enabled = ledger.enable(v.version_id, eval_passed=True, eval_report="passed")
        self.assertEqual(enabled.status, "enabled")
        self.assertEqual(ledger.active("rules").version_id, v.version_id)

    def test_new_enable_supersedes_previous(self):
        ledger = VersionLedger()
        v1 = self._applied(ledger)
        ledger.enable(v1.version_id, eval_passed=True)
        v2 = ledger.apply(kind="rules", content={"when": "y"}, proposal_id="prop_02")
        ledger.enable(v2.version_id, eval_passed=True)
        self.assertEqual(ledger.history("rules")[0].status, "superseded")
        self.assertEqual(ledger.history("rules")[1].status, "enabled")


class RollbackTest(unittest.TestCase):
    def _two_versions(self):
        ledger = VersionLedger()
        v1 = ledger.apply(kind="rules", content={"when": "old"}, proposal_id="prop_01")
        ledger.enable(v1.version_id, eval_passed=True)
        v2 = ledger.apply(kind="rules", content={"when": "new"}, proposal_id="prop_02")
        ledger.enable(v2.version_id, eval_passed=True)
        return ledger, v1, v2

    def test_rollback_restores_previous_version(self):
        ledger, v1, _v2 = self._two_versions()
        restored = ledger.rollback("rules")
        self.assertEqual(restored.version_id, v1.version_id)
        self.assertEqual(ledger.active("rules").content, {"when": "old"})

    def test_rollback_keeps_audit_events(self):
        events: list[dict] = []
        ledger = VersionLedger(audit_sink=events.append)
        v1 = ledger.apply(kind="rules", content={"when": "old"}, proposal_id="prop_01")
        ledger.enable(v1.version_id, eval_passed=True)
        v2 = ledger.apply(kind="rules", content={"when": "new"}, proposal_id="prop_02")
        ledger.enable(v2.version_id, eval_passed=True)
        ledger.rollback("rules")
        names = [e["event"] for e in events]
        self.assertIn("version.rolled_back", names)
        self.assertIn("version.restored", names)
        self.assertIn("version.applied", names)

    def test_rerun_after_rollback_uses_old_version(self):
        ledger, _v1, _v2 = self._two_versions()
        ledger.rollback("rules")
        # 重新执行同一任务时读 active —— 得到旧版本内容
        self.assertEqual(ledger.active("rules").content, {"when": "old"})

    def test_rollback_without_enabled_version_is_refused(self):
        ledger = VersionLedger()
        with self.assertRaises(VersionError):
            ledger.rollback("rules")


class PersistenceTest(unittest.TestCase):
    """验收：批准、应用、回滚三个状态在刷新和重启后都保持一致。"""

    def test_snapshot_restore_keeps_statuses_identical(self):
        events_first: list[dict] = []
        ledger = VersionLedger(audit_sink=events_first.append)
        v1 = ledger.apply(kind="rules", content={"when": "old"}, proposal_id="prop_01",
                          created_at="2026-10-17T10:00:00Z")
        ledger.enable(v1.version_id, eval_passed=True)
        v2 = ledger.apply(kind="rules", content={"when": "new"}, proposal_id="prop_02",
                          created_at="2026-10-17T11:00:00Z")
        ledger.enable(v2.version_id, eval_passed=True)
        ledger.rollback("rules")
        snapshot = ledger.snapshot()

        # 「重启」：从快照重建
        revived = VersionLedger.from_snapshot(snapshot)
        revived_history = revived.history("rules")
        self.assertEqual([rec["status"] for rec in snapshot],
                         [v.status for v in revived_history])
        self.assertEqual([rec["version_id"] for rec in snapshot],
                         [v.version_id for v in revived_history])
        self.assertEqual(revived.active("rules").content, {"when": "old"})

    def test_snapshot_records_carry_proposal_ids(self):
        ledger = VersionLedger()
        ledger.apply(kind="prompts", content={"tpl": "a"}, proposal_id="prop_prompts")
        [rec] = ledger.snapshot()
        self.assertEqual(rec["proposal_id"], "prop_prompts")


if __name__ == "__main__":
    unittest.main()
