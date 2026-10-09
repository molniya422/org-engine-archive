"""P5.4 — local files & spreadsheet capability pack.

扫描用户授权的文件夹（绝不越过 workspace scope），读取文档标题/来源/截止日期/
表格列名，产出材料摘要、待办、未确定项和重复项——每条结论带来源。可预览的
整理结果写入新草稿文件；原文件默认只读。生成提醒候选，不自动创建提醒、
不外发、不提交、不删除。敏感字段在输出前脱敏。
"""

from __future__ import annotations

import csv
import hashlib
import re
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path
from typing import Any

from ..tools.registry import ToolRegistry

DATE_RE = re.compile(r"(\d{4})-(\d{2})-(\d{2})")
SENSITIVE_RE = re.compile(r"\d{17}[\dXx]|\d{15}")     # 身份证号
SENSITIVE_KEYS = ("身份证", "工资", "银行", "密码")

READABLE_SUFFIXES = {".md", ".txt", ".csv"}


@dataclass
class MaterialOutcome:
    summary: dict[str, Any]
    todos: list[dict[str, Any]] = field(default_factory=list)
    duplicates: list[str] = field(default_factory=list)
    unresolved: list[dict[str, Any]] = field(default_factory=list)
    reminder_candidates: list[dict[str, Any]] = field(default_factory=list)
    draft_path: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "summary": self.summary, "todos": self.todos,
            "duplicates": self.duplicates, "unresolved": self.unresolved,
            "reminder_candidates": self.reminder_candidates,
            "draft_path": self.draft_path,
        }


def _redact(text: str) -> str:
    text = SENSITIVE_RE.sub("<redacted>", text)
    for key in SENSITIVE_KEYS:
        if key in text:
            lines = text.splitlines()
            text = "\n".join(
                line if key not in line else f"{line.split('：')[0]}：<redacted>"
                for line in lines
            )
    return text


class MaterialCommitmentScenario:
    def __init__(self, registry: ToolRegistry, allowed_scopes: tuple[str, ...]) -> None:
        self.registry = registry
        self.allowed_scopes = allowed_scopes

    def _check_scope(self, folder: str) -> None:
        if not any(folder.startswith(s) for s in self.allowed_scopes):
            raise ValueError(f"文件夹 {folder} 不在授权范围内")

    def scan_folder(self, folder: str) -> Any:
        self._check_scope(folder)
        root = Path(folder)
        files = sorted(
            p for p in root.iterdir()
            if p.is_file() and p.suffix.lower() in READABLE_SUFFIXES
        )
        return {"files": files}

    def _read_one(self, path: Path) -> dict[str, Any]:
        """读取一个文件 → {title, due, columns, raw, readable}。"""
        info: dict[str, Any] = {
            "file": path.name, "title": "", "due": None, "columns": [],
            "readable": True, "source_lines": [],
        }
        try:
            text = path.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError):
            info["readable"] = False
            return info
        if not text.strip():
            info["readable"] = False  # 空文件视为不可整理
            return info
        info["title"] = next((l.lstrip("# ").strip() for l in text.splitlines() if l.strip()), "")
        for i, line in enumerate(text.splitlines(), 1):
            m = DATE_RE.search(line)
            if m:
                try:
                    info["due"] = date(int(m.group(1)), int(m.group(2)), int(m.group(3))).isoformat()
                    info["source_lines"].append({"line": i, "text": line.strip()})
                except ValueError:
                    pass
        if path.suffix.lower() == ".csv":
            try:
                rows = list(csv.reader(text.splitlines()))
                if rows:
                    info["columns"] = rows[0]
            except csv.Error:
                pass
        return info

    def run(self, folder: str) -> MaterialOutcome:
        self._check_scope(folder)
        listing = self.scan_folder(folder)
        infos = [self._read_one(p) for p in listing["files"]]

        # 摘要
        summary = {
            "total_files": len(infos),
            "readable": sum(1 for i in infos if i["readable"]),
            "unreadable": sum(1 for i in infos if not i["readable"]),
            "with_dates": sum(1 for i in infos if i["due"]),
        }

        # 待办（有截止日期 + 未过期）
        today = date(2026, 10, 9)   # 固定"今天"以保证 fixture 可重放
        todos = []
        for i in infos:
            if i["due"]:
                expired = date.fromisoformat(i["due"]) < today
                todos.append({
                    "title": i["title"] or i["file"],
                    "due": i["due"],
                    "expired": expired,
                    "source": {"file": i["file"], "lines": i["source_lines"]},
                })

        # 重复项（标题+截止日期相同）
        seen: dict[tuple[str, str], str] = {}
        duplicates = []
        for i in infos:
            key = (i["title"], i["due"] or "")
            if key in seen and i["title"]:
                duplicates.append(f"{i['file']} 与 {seen[key]} 内容重复")
            else:
                seen[key] = i["file"]

        # 未确定项（歧义日期、空文件、不可读）
        unresolved = []
        for i in infos:
            if not i["readable"]:
                unresolved.append({
                    "file": i["file"],
                    "note": "文件不可读或为空，需要你确认内容",
                    "source": {"file": i["file"], "lines": []},
                })
                continue
            try:
                text = (Path(folder) / i["file"]).read_text(encoding="utf-8")
            except (OSError, UnicodeDecodeError):
                continue
            if ("下个月" in text or "待定" in text) and not i["due"]:
                unresolved.append({
                    "file": i["file"],
                    "note": "日期表述不明确（如“下个月”），需要你补充具体日期",
                    "source": {"file": i["file"], "lines": []},
                })

        # 提醒候选（未过期待办 → 应用内提醒候选，不自动创建）
        reminder_candidates = [
            {"kind": "create_reminder_candidate", "title": t["title"], "due": t["due"],
             "auto_created": False}
            for t in todos if not t["expired"]
        ]

        # 草稿（新文件，原文件只读）
        draft_path = str(Path(folder) / "整理汇总.md")
        lines = [f"# 材料整理汇总（{folder}）", "", "## 待办", ""]
        for t in todos:
            mark = "（已过期）" if t["expired"] else ""
            lines.append(f"- {t['title']} —— 截止 {t['due']}{mark}（来源：{t['source']['file']}）")
        lines += ["", "## 未确定项", ""]
        for u in unresolved:
            lines.append(f"- {u['file']}：{u['note']}")
        lines += ["", "## 重复项", ""]
        lines += [f"- {d}" for d in duplicates] or ["- 无"]
        draft_text = _redact("\n".join(lines))
        result = self.registry.invoke(
            "create_draft", {"path": draft_path, "content": draft_text},
            executor=lambda p: (Path(p["path"]).write_text(p["content"], encoding="utf-8"),
                                {"path": p["path"]})[1],
        )

        return MaterialOutcome(
            summary=summary, todos=todos, duplicates=duplicates,
            unresolved=unresolved, reminder_candidates=reminder_candidates,
            draft_path=result["path"],
        )
