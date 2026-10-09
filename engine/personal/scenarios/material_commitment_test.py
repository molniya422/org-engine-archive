"""P5.4 tests — local files & spreadsheet capability pack (material_commitment).

验收：用十份包含歧义、重复、过期、敏感和不可读文件的 fixture 完成一次事务；
整理后的新文件可打开，原文件未被修改。
"""

from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from personal.scenarios.material_commitment import MaterialCommitmentScenario
from personal.tools.registry import ToolRegistry


def make_ten_files(root: Path) -> list[Path]:
    """10 份 fixture：歧义、重复、过期、敏感、不可读。"""
    files = []
    # 1. 正常发票（含截止日期）
    f = root / "invoice_a.md"
    f.write_text("# 报销单A\n金额：¥120\n截止日期：2026-10-15\n来源：财务部邮件", encoding="utf-8")
    files.append(f)
    # 2. 重复发票（同金额同来源，只有文件名不同）
    f = root / "invoice_a_copy.md"
    f.write_text("# 报销单A\n金额：¥120\n截止日期：2026-10-15\n来源：财务部邮件", encoding="utf-8")
    files.append(f)
    # 3. 过期事项
    f = root / "expired.md"
    f.write_text("# 保险续费\n截止日期：2026-01-01\n已过期", encoding="utf-8")
    files.append(f)
    # 4. 敏感信息
    f = root / "salary.md"
    f.write_text("# 薪资单\n工资：¥30000\n身份证号：110101199001011234", encoding="utf-8")
    files.append(f)
    # 5. 不可读（坏编码）
    f = root / "broken.md"
    f.write_bytes(b"\xff\xfe\x00broken\xff")
    files.append(f)
    # 6. 歧义日期（"下个月"）
    f = root / "ambiguous.md"
    f.write_text("# 体检提醒\n时间：下个月\n地点：待定", encoding="utf-8")
    files.append(f)
    # 7. 表格类
    f = root / "table.csv"
    f.write_text("项目,金额,截止\n房租,3500,2026-11-01\n水电,200,2026-10-20\n", encoding="utf-8")
    files.append(f)
    # 8. 无日期普通笔记
    f = root / "note.md"
    f.write_text("# 购物清单\n牛奶、鸡蛋", encoding="utf-8")
    files.append(f)
    # 9. 空文件
    f = root / "empty.md"
    f.write_text("", encoding="utf-8")
    files.append(f)
    # 10. 另一个正常待办
    f = root / "renew.md"
    f.write_text("# 域名续费\n截止日期：2026-11-30\n金额：¥60", encoding="utf-8")
    files.append(f)
    return files


class TestMaterialCommitment(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name) / "workspace" / "receipts"
        self.root.mkdir(parents=True)
        self.files = make_ten_files(self.root)
        self.scenario = MaterialCommitmentScenario(
            registry=ToolRegistry.with_defaults(),
            allowed_scopes=(str(self.root),),
        )

    def tearDown(self):
        self.tmp.cleanup()

    def _snapshots(self) -> dict[str, bytes]:
        return {f.name: f.read_bytes() for f in self.files}

    def test_scans_only_within_scope(self):
        listing = self.scenario.scan_folder(str(self.root))
        self.assertEqual(len(listing["files"]), 10)
        with self.assertRaises(ValueError):
            self.scenario.scan_folder("D:/somewhere-else")

    def test_full_transaction_over_ten_files(self):
        """验收：十份文件一次事务，产出摘要/待办/未确定项/重复项。"""
        outcome = self.scenario.run(str(self.root))
        # 摘要
        self.assertTrue(outcome.summary["total_files"] == 10)
        self.assertTrue(outcome.summary["unreadable"] >= 1)
        # 待办（有截止日期的）
        todos = outcome.todos
        self.assertTrue(any("2026-10-15" in t["due"] for t in todos))
        # 重复项（invoice_a 重复）
        self.assertTrue(any("invoice_a" in d for d in outcome.duplicates))
        # 未确定项（歧义日期、空文件、不可读）
        self.assertTrue(any("下个月" in u["note"] or "待定" in u["note"] for u in outcome.unresolved))
        # 敏感内容不进入摘要正文
        self.assertNotIn("110101199001011234", json.dumps(outcome.to_dict(), ensure_ascii=False))

    def test_originals_untouched_and_draft_readable(self):
        """验收原文：整理后的新文件可打开，原文件未被修改。"""
        before = self._snapshots()
        outcome = self.scenario.run(str(self.root))
        self.assertEqual(self._snapshots(), before, "原文件必须未被修改")
        draft_path = Path(outcome.draft_path)
        self.assertTrue(draft_path.is_file())
        content = draft_path.read_text(encoding="utf-8")  # 可打开、可读取
        self.assertIn("待办", content)

    def test_draft_inside_scope(self):
        outcome = self.scenario.run(str(self.root))
        self.assertTrue(str(outcome.draft_path).startswith(str(self.root)))

    def test_reminder_candidates_not_auto_created(self):
        """生成的是提醒候选，不自动创建提醒、不外发。"""
        outcome = self.scenario.run(str(self.root))
        self.assertTrue(outcome.reminder_candidates)
        for cand in outcome.reminder_candidates:
            self.assertEqual(cand["kind"], "create_reminder_candidate")
            self.assertFalse(cand.get("auto_created", False))

    def test_every_conclusion_has_source(self):
        """每条结论保留来源（文件名 + 行号或片段）。"""
        outcome = self.scenario.run(str(self.root))
        for t in outcome.todos:
            self.assertIn("source", t)
            self.assertTrue(t["source"]["file"])
        for u in outcome.unresolved:
            self.assertIn("source", u)


if __name__ == "__main__":
    unittest.main()
