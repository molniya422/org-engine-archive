"""Collector — 只读聚合现有信号源为 LearningEvent JSONL。

来源(M1):
  1. training-loop/feedback.md  → skill_miss/skill_fp/dispatch_miss/dispatch_fp
  2. loop-engineering/run-log.jsonl(outcome 非 ok/initialized/success)→ budget_warn
契约违约(contract_violation)来源在 M2 由运行端接线;M1 规则测试用合成事件。
"""
import hashlib
import json
import re
from datetime import datetime, timezone

from .schema import append_events, read_events

_SECTION_KINDS = {
    ("SkillOpt", "Miss"): "skill_miss",
    ("SkillOpt", "False Positive"): "skill_fp",
    ("MultiAgentOpt", "Miss"): "dispatch_miss",
    ("MultiAgentOpt", "False Positive"): "dispatch_fp",
}
_SKILL_RE = re.compile(r"\[skill:([^\]]+)\]")
_OK_OUTCOMES = {"ok", "initialized", "success"}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def collect_feedback_md(feedback_path) -> list:
    """解析 feedback.md 的 ### Miss / ### False Positive 条目。

    每条 `- ...` 条目产生一个事件;空标题(无条目)不产出。
    """
    if not feedback_path.exists():
        return []
    out, section, heading = [], None, None
    for raw in feedback_path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        m = re.match(r"^##\s+(SkillOpt|MultiAgentOpt|ToolCallOpt)\b", line)
        if m:
            section = m.group(1)
            heading = None
            continue
        m = re.match(r"^###\s+(Miss|False Positive)\b", line)
        if m:
            heading = m.group(1) if (section, m.group(1)) in _SECTION_KINDS else None
            continue
        if section and heading and line.startswith("-"):
            skill = _SKILL_RE.search(line)
            out.append({
                "ts": _now(),
                "run_id": "seed",
                "kind": _SECTION_KINDS[(section, heading)],
                "payload": {
                    "source": "feedback.md",
                    "detail": line.lstrip("- ").strip(),
                    **({"skill": skill.group(1)} if skill else {}),
                },
            })
    return out


def collect_run_log(run_log_path) -> list:
    if not run_log_path.exists():
        return []
    out = []
    for line in run_log_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            entry = json.loads(line)
        except json.JSONDecodeError:
            continue
        outcome = entry.get("outcome")
        if outcome is not None and outcome not in _OK_OUTCOMES:
            out.append({
                "ts": (entry.get("iso") or entry.get("started_at") or _now()).replace("Z", "+00:00"),
                "run_id": str(entry.get("run_id") or entry.get("pattern") or "unknown"),
                "kind": "budget_warn",
                "payload": {"source": "run-log.jsonl", "pattern": entry.get("pattern"), "outcome": outcome},
            })
    return out


def _key(ev) -> str:
    return hashlib.sha1(
        json.dumps(ev["payload"], sort_keys=True, ensure_ascii=False).encode()
    ).hexdigest()


def run_collection(feedback_md, run_log, out_path) -> int:
    """全量收集 + 按内容去重后追加。返回新增条数。"""
    seen = {_key(e) for e in read_events(out_path)}
    fresh = [e for e in collect_feedback_md(feedback_md) + collect_run_log(run_log)
             if _key(e) not in seen]
    return append_events(out_path, fresh)