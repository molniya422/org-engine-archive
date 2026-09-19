"""EvolutionReport — 滚动窗口聚合。"""
from datetime import datetime, timedelta, timezone


def build_report(events, window_days: int = 7, now=None) -> dict:
    now_dt = datetime.fromisoformat(now) if now else datetime.now(timezone.utc)
    cutoff = now_dt - timedelta(days=window_days)
    window = [e for e in events
              if datetime.fromisoformat(e["ts"].replace("Z", "+00:00")) >= cutoff]
    counts = {}
    skill_miss = {}
    for e in window:
        counts[e["kind"]] = counts.get(e["kind"], 0) + 1
        if e["kind"] == "skill_miss" and e["payload"].get("skill"):
            s = e["payload"]["skill"]
            skill_miss[s] = skill_miss.get(s, 0) + 1
    highlights = [k for k, v in counts.items() if v >= 3]
    return {
        "generated_at": now_dt.isoformat(timespec="seconds"),
        "window_days": window_days,
        "total_events": len(window),
        "counts": counts,
        "skill_miss": skill_miss,
        "highlights": highlights,
    }