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