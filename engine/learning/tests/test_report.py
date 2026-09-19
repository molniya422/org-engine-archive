from learning.report import build_report

EVENTS = [
    {"ts": "2026-09-10T00:00:00+00:00", "run_id": "r", "kind": "skill_miss", "payload": {"skill": "dpa"}},
    {"ts": "2026-09-10T00:00:00+00:00", "run_id": "r", "kind": "skill_miss", "payload": {"skill": "dpa"}},
    {"ts": "2026-09-10T00:00:00+00:00", "run_id": "r", "kind": "skill_miss", "payload": {"skill": "dpa"}},
    {"ts": "2026-08-01T00:00:00+00:00", "run_id": "r", "kind": "budget_warn", "payload": {}},  # 窗口外
]


def test_window_filters_and_counts():
    r = build_report(EVENTS, window_days=7, now="2026-09-11T00:00:00+00:00")
    assert r["total_events"] == 3
    assert r["counts"]["skill_miss"] == 3
    assert r["skill_miss"] == {"dpa": 3}
    assert "skill_miss" in r["highlights"]   # ≥3 进入 highlights


def test_window_includes_old_when_large():
    r = build_report(EVENTS, window_days=60, now="2026-09-11T00:00:00+00:00")
    assert r["total_events"] == 4