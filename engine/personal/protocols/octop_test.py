"""Tests for PersonalDecisionProtocol — Octop tool receipt mapping.

Uses the shared fixture at
``editor/docs/integration/fixtures/octop-tool-receipt.json`` and inline cases
to cover success / failure / cancellation / tolerance / invalid-input.
Only the standard library is required (json, dataclasses, hashlib, datetime).
"""

from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path

import pytest

from personal.protocols.octop import (
    PROTOCOL_VERSION,
    ProtocolMappingError,
    ToolReceipt,
    from_trajectory_event,
    isError,
    protocol_version,
    to_evidence,
    toolName,
)

FIXTURE_PATH = (
    Path(__file__).resolve().parents[3]
    / "editor"
    / "docs"
    / "integration"
    / "fixtures"
    / "octop-tool-receipt.json"
)


def _load_fixture_events() -> list[dict]:
    data = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))
    return data["events"]


SHA256_RE = re.compile(r"^sha256:[0-9a-f]{64}$")
ISO_Z_RE = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$")


def _event(event_id: str) -> dict:
    for ev in _load_fixture_events():
        if ev["event_id"] == event_id:
            return ev
    raise AssertionError(f"fixture event {event_id} not found")


# ---------------------------------------------------------------------------
# happy path: success / failure / cancellation
# ---------------------------------------------------------------------------


def test_successful_read_file_maps_to_evidence():
    receipt = from_trajectory_event(_event("ev_read_file_001"))
    assert receipt.protocol_version == PROTOCOL_VERSION
    assert receipt.tool_name == "read_file"
    assert receipt.is_error is False
    assert receipt.call_id == "call_0d1e"
    assert receipt.args == {"path": "workspace/inbox/a.pdf"}
    assert receipt.result == {
        "content": "A4 报销单，含 3 页扫描，抬头为 2026-10 差旅报销。",
        "mime": "application/pdf",
        "pages": 3,
    }
    assert isError(receipt) is False
    assert toolName(receipt) == "read_file"
    assert protocol_version() == PROTOCOL_VERSION

    evidence = to_evidence(receipt)
    assert evidence["id"] == "evidence_octop_ev_read_file_001"
    assert evidence["kind"] == "tool_result"
    assert evidence["locator"] == "octop://trajectory/personal-assistant/thr_inbox_0421/ev_read_file_001"
    assert SHA256_RE.match(evidence["content_hash"])
    assert evidence["captured_at"] == "2025-10-10T02:40:00Z"
    assert ISO_Z_RE.match(evidence["captured_at"])
    assert evidence["sensitivity"] == "normal"
    assert evidence["supports"] == []


def test_failed_external_send_is_error_and_maps():
    receipt = from_trajectory_event(_event("ev_external_send_002"))
    assert receipt.is_error is True
    assert receipt.tool_name == "external_send"
    assert receipt.result == {"error": "smtp timeout after 10s", "status": "failed"}
    assert isError(receipt) is True

    evidence = to_evidence(receipt)
    assert evidence["id"] == "evidence_octop_ev_external_send_002"
    # Errored receipts still produce evidence — the RuleEngine decides gating.
    assert SHA256_RE.match(evidence["content_hash"])


def test_cancelled_receipt_is_tolerant_when_result_missing():
    receipt = from_trajectory_event(_event("ev_external_send_003"))
    # No "result" key in payload -> normalized to None, not an exception.
    assert receipt.result is None
    assert receipt.is_error is True
    assert receipt.tool_name == "external_send"
    assert receipt.args == {"to": "reimburse@example.com", "subject": "2026-10 报销单"}

    evidence = to_evidence(receipt)
    assert evidence["id"] == "evidence_octop_ev_external_send_003"
    assert SHA256_RE.match(evidence["content_hash"])


# ---------------------------------------------------------------------------
# tolerance + determinism
# ---------------------------------------------------------------------------


def test_payload_missing_name_is_tolerant():
    event = {
        "event_id": "ev_anon",
        "thread_id": "t",
        "agent_id": "a",
        "seq": 1,
        "ts": 1700000000.0,
        "kind": "tool",
        "is_error": False,
        "summary": "",
        "payload": {"call_id": "x", "args": {"p": 1}},
    }
    receipt = from_trajectory_event(event)
    assert receipt.tool_name == ""
    assert receipt.args == {"p": 1}
    assert receipt.result is None
    assert receipt.is_error is False


def test_payload_missing_entirely_is_tolerated():
    event = {
        "event_id": "ev_nopayload",
        "thread_id": "t",
        "agent_id": "a",
        "seq": 2,
        "ts": 1700000001.0,
        "kind": "tool",
        "is_error": False,
        "summary": "",
    }
    receipt = from_trajectory_event(event)
    assert receipt.raw_payload == {}
    assert receipt.tool_name == ""
    assert receipt.call_id is None


def test_content_hash_is_deterministic_and_depends_on_result():
    base = {
        "event_id": "ev_determ",
        "thread_id": "t",
        "agent_id": "a",
        "seq": 3,
        "ts": 1700000002.0,
        "kind": "tool",
        "is_error": False,
        "summary": "",
        "payload": {"name": "read_file", "args": {"path": "x"}, "result": {"ok": True}},
    }
    r1 = from_trajectory_event(base)
    r2 = from_trajectory_event(base)
    assert to_evidence(r1)["content_hash"] == to_evidence(r2)["content_hash"]

    changed = {**base, "payload": {**base["payload"], "result": {"ok": False}}}
    r3 = from_trajectory_event(changed)
    assert to_evidence(r3)["content_hash"] != to_evidence(r1)["content_hash"]


def test_captured_at_round_trips_to_epoch():
    receipt = from_trajectory_event(_event("ev_read_file_001"))
    evidence = to_evidence(receipt)
    parsed = datetime.fromisoformat(evidence["captured_at"].replace("Z", "+00:00"))
    assert parsed.tzinfo == timezone.utc
    assert parsed.timestamp() == receipt.ts


# ---------------------------------------------------------------------------
# invalid input raises ProtocolMappingError
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "bad",
    [None, "not-a-dict", 42, [1, 2, 3]],
)
def test_raises_on_invalid_input(bad):
    with pytest.raises(ProtocolMappingError):
        from_trajectory_event(bad)


def test_raises_on_non_tool_kind():
    event = {
        "event_id": "ev_user",
        "thread_id": "t",
        "agent_id": "a",
        "seq": 1,
        "ts": 1700000000.0,
        "kind": "user",
        "is_error": False,
        "summary": "",
        "payload": {},
    }
    with pytest.raises(ProtocolMappingError, match="kind='tool'"):
        from_trajectory_event(event)


def test_raises_on_missing_event_id():
    event = {
        "thread_id": "t",
        "agent_id": "a",
        "seq": 1,
        "ts": 1700000000.0,
        "kind": "tool",
        "is_error": False,
        "summary": "",
        "payload": {},
    }
    with pytest.raises(ProtocolMappingError, match="event_id"):
        from_trajectory_event(event)


def test_raises_on_non_string_event_id():
    event = {
        "event_id": 123,
        "thread_id": "t",
        "agent_id": "a",
        "seq": 1,
        "ts": 1700000000.0,
        "kind": "tool",
        "is_error": False,
        "summary": "",
        "payload": {},
    }
    with pytest.raises(ProtocolMappingError, match="event_id"):
        from_trajectory_event(event)


def test_raises_on_non_finite_ts():
    event = {
        "event_id": "ev",
        "thread_id": "t",
        "agent_id": "a",
        "seq": 1,
        "ts": float("nan"),
        "kind": "tool",
        "is_error": False,
        "summary": "",
        "payload": {},
    }
    with pytest.raises(ProtocolMappingError, match="ts"):
        from_trajectory_event(event)


def test_raises_on_non_mapping_payload():
    event = {
        "event_id": "ev",
        "thread_id": "t",
        "agent_id": "a",
        "seq": 1,
        "ts": 1700000000.0,
        "kind": "tool",
        "is_error": False,
        "summary": "",
        "payload": "not-a-dict",
    }
    with pytest.raises(ProtocolMappingError, match="payload"):
        from_trajectory_event(event)


def test_tool_receipt_is_frozen():
    receipt = from_trajectory_event(_event("ev_read_file_001"))
    with pytest.raises(Exception):
        # frozen dataclass: attribute assignment raises FrozenInstanceError
        receipt.tool_name = "tampered"  # type: ignore[misc]
