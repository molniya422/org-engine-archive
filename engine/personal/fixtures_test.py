"""P9 后置 tests — 夹具矩阵。

计划书「Required test fixtures」要求 15 项隔离夹具。本测试验证：
1. 恰好 15 项、全部可构建、互不污染（独立子目录）。
2. 文件与期望的真实性（哈希、歧义文本、敏感内容等 spot check）。
3. 同名夹具重复构建是幂等的（重建目录，不留残渣）。
"""

from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from personal.fixtures import (
    Fixture,
    REQUIRED_FIXTURES,
    build_all,
    build_duplicate_documents,
    build_sensitive_document,
)

EXPECTED = {
    "empty_workspace", "ten_document_inbox", "ambiguous_deadline",
    "duplicate_documents", "sensitive_document", "expired_commitment",
    "unreadable_file", "missing_local_model", "malformed_model_output",
    "blocked_external_send", "verifier_failure", "user_edit_then_rollback",
    "multi_turn_ambiguous_reference", "calendar_capability",
    "partial_composite",
}


class FixtureMatrixTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls._tmp = tempfile.TemporaryDirectory()
        cls.fixtures = build_all(Path(cls._tmp.name))

    @classmethod
    def tearDownClass(cls):
        cls._tmp.cleanup()

    def test_exactly_the_fifteen_required_fixtures(self):
        self.assertEqual(set(self.fixtures), EXPECTED)
        self.assertEqual(tuple(sorted(REQUIRED_FIXTURES)), tuple(sorted(EXPECTED)))

    def test_each_fixture_is_isolated_in_its_own_directory(self):
        dirs = {f.workspace for f in self.fixtures.values()}
        self.assertEqual(len(dirs), 15)
        for f in self.fixtures.values():
            self.assertTrue(f.workspace.is_dir(), f.name)
            self.assertEqual(len(f.expect) > 0, True, f.name)

    def test_empty_workspace_has_no_files(self):
        f = self.fixtures["empty_workspace"]
        self.assertEqual(list(f.workspace.iterdir()), [])

    def test_ten_document_inbox_has_ten_dated_documents(self):
        f = self.fixtures["ten_document_inbox"]
        files = sorted(p.name for p in f.workspace.iterdir())
        self.assertEqual(len(files), 10)
        self.assertEqual(f.expect["todo_count"], 10)

    def test_ambiguous_deadline_contains_relative_date(self):
        f = self.fixtures["ambiguous_deadline"]
        text = f.file("ambiguous.md").read_text(encoding="utf-8")
        self.assertIn("下个月", text)
        self.assertTrue(f.expect["must_ask_before_assuming"])

    def test_duplicate_documents_have_identical_hashes(self):
        f = self.fixtures["duplicate_documents"]
        import hashlib
        a = hashlib.sha256(f.file("invoice_a.md").read_bytes()).hexdigest()
        b = hashlib.sha256(f.file("invoice_a_copy.md").read_bytes()).hexdigest()
        self.assertEqual(a, b)
        self.assertTrue(f.expect["content_hashes_equal"])

    def test_sensitive_document_carries_redaction_triggers(self):
        f = self.fixtures["sensitive_document"]
        text = f.file("personnel.md").read_text(encoding="utf-8")
        self.assertIn("110101199001011234", text)
        self.assertIn("13800138000", text)
        # 夹具本身不脱敏——脱敏是消费方（signals/redact）的责任
        self.assertTrue(f.expect["raw_content_must_not_enter_learning_events"])

    def test_expired_commitment_is_in_the_past(self):
        f = self.fixtures["expired_commitment"]
        self.assertIn("2026-01-01", f.file("insurance.md").read_text(encoding="utf-8"))
        self.assertTrue(f.expect["expired"])

    def test_unreadable_file_is_binary_garbage(self):
        f = self.fixtures["unreadable_file"]
        data = f.file("broken.bin").read_bytes()
        self.assertNotEqual(data.decode("utf-8", errors="ignore").strip(), "# 材料")

    def test_missing_model_fixture_declares_offline_expectations(self):
        f = self.fixtures["missing_local_model"]
        self.assertEqual(f.expect["provider"], "missing")
        self.assertIn("must_not", f.expect)

    def test_malformed_output_fixture_carries_the_bad_json(self):
        f = self.fixtures["malformed_model_output"]
        self.assertEqual(f.expect["raw_output"], '{"todos": [ broken')
        self.assertTrue(f.expect["must_not_crash"])

    def test_blocked_send_declares_rule_engine_must_block(self):
        f = self.fixtures["blocked_external_send"]
        self.assertEqual(f.expect["attempted_action"], "external_send")
        self.assertEqual(f.expect["must_be_blocked_by"], "rule_engine")

    def test_verifier_failure_forbids_done_claim(self):
        f = self.fixtures["verifier_failure"]
        self.assertEqual(f.expect["verification_status"], "executed_unverified")

    def test_multi_turn_fixture_has_two_hotel_tasks_and_ambiguous_reference(self):
        f = self.fixtures["multi_turn_ambiguous_reference"]
        self.assertEqual(len(f.expect["open_tasks"]), 2)
        self.assertIn("刚才那个", f.expect["ambiguous_reference"])

    def test_calendar_fixture_covers_enabled_and_disabled(self):
        f = self.fixtures["calendar_capability"]
        self.assertIn("enabled", f.expect)
        self.assertIn("disabled", f.expect)
        self.assertTrue(f.expect["disabled"]["no_record_created"])

    def test_partial_composite_marks_which_step_retries(self):
        f = self.fixtures["partial_composite"]
        steps = {s["id"]: s for s in f.expect["steps"]}
        self.assertEqual(steps["draft"]["retry"], "skip")
        self.assertEqual(steps["reminder"]["retry"], "redo")


class RebuildTest(unittest.TestCase):
    def test_rebuilding_a_fixture_is_idempotent(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            first = build_duplicate_documents(root)
            first.file("invoice_a.md").write_text("被用户改过", encoding="utf-8")
            second = build_duplicate_documents(root)
            self.assertEqual(second.workspace, first.workspace)
            # 重建恢复原内容——不残留上一次的状态
            self.assertIn("500 元", second.file("invoice_a.md").read_text(encoding="utf-8"))
            self.assertIn("110101199001011234",
                          build_sensitive_document(root).file("personnel.md").read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
