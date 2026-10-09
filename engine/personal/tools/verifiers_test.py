"""P5.3 tests — tool verifiers.

验收：删除执行结果文件后重新验证，系统显示未完成或不可验证。
- read_file: 验证文件仍存在且 hash 未变化。
- create_draft: 验证草稿文件确实存在并可读取。
- create_reminder: 验证提醒记录已写入。
- 模型返回"已完成"永远不是证据。
- verifier 失败 → executed_unverified 或 blocked，不是 done。
"""

from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from personal.tools.verifiers import (
    VerificationStatus,
    verify_read_file,
    verify_create_draft,
    verify_create_reminder,
    verify_tool_call,
)


class TestReadFileVerifier(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self.tmp.name)
        self.file = self.dir / "report.md"
        self.file.write_text("hello", encoding="utf-8")

    def tearDown(self):
        self.tmp.cleanup()

    def test_file_intact_verifies(self):
        v = verify_read_file(str(self.file), content_hash_at_read=None)
        # No baseline hash → presence check only.
        self.assertEqual(v.status, "verified")

    def test_file_deleted_shows_unverifiable(self):
        self.file.unlink()
        v = verify_read_file(str(self.file), content_hash_at_read="abc")
        self.assertEqual(v.status, "unverifiable")
        self.assertNotEqual(v.status, "done")

    def test_file_modified_shows_hash_mismatch(self):
        baseline = verify_read_file(str(self.file), content_hash_at_read=None)
        baseline_hash = baseline.checks[1]["hash"]
        self.file.write_text("tampered", encoding="utf-8")
        v = verify_read_file(str(self.file), content_hash_at_read=baseline_hash)
        self.assertEqual(v.status, "failed")
        self.assertTrue(any(c["check"] == "content_hash" and not c["passed"] for c in v.checks))


class TestCreateDraftVerifier(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def test_draft_exists_and_readable(self):
        path = self.dir / "draft.md"
        path.write_text("草稿内容", encoding="utf-8")
        v = verify_create_draft(str(path))
        self.assertEqual(v.status, "verified")
        self.assertTrue(any(c["check"] == "readable" and c["passed"] for c in v.checks))

    def test_draft_deleted_afterwards_is_unverifiable(self):
        """验收原文：删除执行结果文件后重新验证 → 未完成/不可验证，不是 done。"""
        path = self.dir / "draft.md"
        path.write_text("x", encoding="utf-8")
        first = verify_create_draft(str(path))
        self.assertEqual(first.status, "verified")
        path.unlink()
        second = verify_create_draft(str(path))
        self.assertIn(second.status, ("unverifiable", "failed"))
        self.assertNotEqual(second.status, "done")

    def test_missing_draft_never_verified(self):
        v = verify_create_draft(str(self.dir / "never.md"))
        self.assertEqual(v.status, "unverifiable")


class TestCreateReminderVerifier(unittest.TestCase):
    def test_reminder_record_present(self):
        store = {"rem_1": {"id": "rem_1", "title": "带体检报告"}}
        v = verify_create_reminder("rem_1", store_get=lambda i: store.get(i))
        self.assertEqual(v.status, "verified")

    def test_missing_reminder_is_unverifiable(self):
        v = verify_create_reminder("rem_x", store_get=lambda i: None)
        self.assertEqual(v.status, "unverifiable")


class TestModelClaimsAreNotEvidence(unittest.TestCase):
    def test_model_says_done_but_verifier_decides(self):
        """模型返回“已完成”不作为证据——verify_tool_call 只看工具结果。"""
        v = verify_tool_call("create_draft", {"path": str(Path(tempfile.gettempdir()) / "no_orgengine_dir" / "x.md")},
                             model_claimed_done=True)
        self.assertEqual(v.status, "unverifiable")
        self.assertNotEqual(v.status, "done")  # never "done" without world evidence


if __name__ == "__main__":
    unittest.main()
