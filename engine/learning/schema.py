"""LearningEvent — 统一学习事件流的 schema 与 JSONL 读写。"""
import json
import re

EVENT_KINDS = {
    "skill_miss", "skill_fp", "dispatch_miss", "dispatch_fp",
    "contract_violation", "budget_warn", "tool_positive", "tool_negative",
    "proposal_applied", "proposal_reverted",
}
_TS_RE = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}")


def validate_event(ev) -> list:
    """返回校验错误列表;空列表 = 合法。"""
    if not isinstance(ev, dict):
        return ["event must be an object"]
    errors = []
    for field in ("ts", "run_id", "kind", "payload"):
        if field not in ev:
            errors.append(f"missing field: {field}")
    if ev.get("kind") not in EVENT_KINDS:
        errors.append(f"kind must be one of {sorted(EVENT_KINDS)}")
    if not _TS_RE.match(str(ev.get("ts", ""))):
        errors.append("ts must be an ISO-8601 timestamp")
    if not isinstance(ev.get("payload"), dict):
        errors.append("payload must be an object")
    return errors


def append_events(path, events) -> int:
    """append-only 写 JSONL,跳过非法事件,返回写入条数。"""
    path.parent.mkdir(parents=True, exist_ok=True)
    written = 0
    with path.open("a", encoding="utf-8") as f:
        for ev in events:
            if validate_event(ev):
                continue
            f.write(json.dumps(ev, ensure_ascii=False) + "\n")
            written += 1
    return written


def read_events(path):
    if not path.exists():
        return []
    out = []
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            ev = json.loads(line)
        except json.JSONDecodeError:
            continue
        if not validate_event(ev):
            out.append(ev)
    return out