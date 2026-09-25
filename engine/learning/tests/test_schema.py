import pytest
from learning.schema import validate_event, append_events, read_events


def test_valid_event_passes():
    ev = {"ts": "2026-09-11T10:00:00+00:00", "run_id": "r1",
          "kind": "skill_miss", "payload": {"skill": "dpa"}}
    assert validate_event(ev) == []


@pytest.mark.parametrize("bad", [
    {"run_id": "r1", "kind": "skill_miss", "payload": {}},        # 缺 ts
    {"ts": "x", "run_id": "r1", "kind": "skill_miss", "payload": {}},  # ts 非法
    {"ts": "2026-09-11T10:00:00+00:00", "run_id": "r1", "payload": {}},  # 缺 kind
    {"ts": "2026-09-11T10:00:00+00:00", "run_id": "r1", "kind": "nope", "payload": {}},
    {"ts": "2026-09-11T10:00:00+00:00", "run_id": "r1", "kind": "skill_miss", "payload": "x"},
])
def test_invalid_events(bad):
    assert validate_event(bad) != []


def test_append_and_read_roundtrip(tmp_path):
    p = tmp_path / "events.jsonl"
    good = {"ts": "2026-09-11T10:00:00+00:00", "run_id": "r1",
            "kind": "skill_miss", "payload": {"skill": "dpa"}}
    bad = {"kind": "nope"}  # 非法,应被跳过
    assert append_events(p, [good, bad]) == 1
    assert read_events(p) == [good]


def test_proposal_audit_kinds_valid():
    for kind in ("proposal_applied", "proposal_reverted"):
        ev = {"ts": "2026-09-25T10:00:00+00:00", "run_id": "r",
              "kind": kind, "payload": {"proposal_id": "p1"}}
        assert validate_event(ev) == []


def test_append_preserves_existing_lines(tmp_path):
    """append-only 完整性:追加不改写既有行。"""
    p = tmp_path / "events.jsonl"
    good = {"ts": "2026-09-25T10:00:00+00:00", "run_id": "r",
            "kind": "skill_miss", "payload": {"skill": "dpa"}}
    assert append_events(p, [good]) == 1
    before = p.read_text(encoding="utf-8")
    assert append_events(p, [good]) == 1
    assert p.read_text(encoding="utf-8").startswith(before)