"""PersonalDecisionProtocol (P0.6 spike) — Python twin of
``editor/backend-server/src/personal/protocol.ts``.

Field names MUST stay identical to the TypeScript module; the protocol is the
contract between Octop (execution base) and Org Engine (personal decision
layer). See plan §2.1 "Relation to Octop" and P0.6 in
``editor/docs/superpowers/plans/2026-10-04-local-personal-decision-assistant-plan.md``.

Data sovereignty (one-way, never bidirectional):
    Octop session / tool receipt -> PersonalDecisionProtocol -> Org Engine
    Evidence, decision trace, rules and learning live in Org Engine stores.
    This module ONLY READS Octop receipts; it NEVER writes to Octop's DB.

Out of scope here (P3/P4/P5): ToolExecutor, RuleEngine, Verifier, action
approval, trace persistence. This module defines the protocol + mapping only.
"""

from __future__ import annotations

import hashlib
import json
import math
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Mapping

PROTOCOL_VERSION = "1.0.0"


class ProtocolMappingError(ValueError):
    """Raised when an Octop trajectory event cannot be mapped to a receipt."""


@dataclass(frozen=True)
class ToolReceipt:
    """Projection of an Octop ``kind == "tool"`` TrajectoryEvent.

    Field names mirror :mod:`editor.backend-server.src.personal.protocol`
    (TypeScript). Octop does not enforce a payload schema; ``call_id`` /
    ``args`` / ``result`` are independently optional and normalize to ``null``
    when absent. ``tool_name`` normalizes to ``""`` when unknown.
    """

    protocol_version: str
    event_id: str
    thread_id: str
    agent_id: str
    seq: int
    ts: float
    turn_id: str | None
    request_seq: int | None
    is_error: bool
    summary: str
    call_id: str | None
    tool_name: str
    args: Any
    result: Any
    raw_payload: Mapping[str, Any]


def from_trajectory_event(event: Mapping[str, Any]) -> ToolReceipt:
    """Map a raw Octop trajectory event (``kind == "tool"``) to a ToolReceipt.

    Tolerance: payload sub-keys (call_id / name / args / result) are optional.
    Strictness: the event must be a mapping with ``kind == "tool"`` and the
    structural fields (event_id / thread_id / agent_id / seq / ts) present with
    the right primitive type. ``payload`` if present must be a mapping. Bad
    input raises :class:`ProtocolMappingError` so callers can quarantine it.
    """
    if not isinstance(event, Mapping):
        raise ProtocolMappingError(
            f"expected a mapping trajectory event, got {type(event).__name__}"
        )
    if event.get("kind") != "tool":
        raise ProtocolMappingError(
            "only kind='tool' events map to a tool receipt (got "
            f"kind={event.get('kind')!r})"
        )

    for required in ("event_id", "thread_id", "agent_id", "seq", "ts"):
        if required not in event:
            raise ProtocolMappingError(f"missing required trajectory field: {required!r}")
    _require_non_empty_str(event, "event_id")
    _require_non_empty_str(event, "thread_id")
    _require_non_empty_str(event, "agent_id")
    _require_finite_number(event, "seq")
    _require_finite_number(event, "ts")

    payload = event.get("payload")
    if payload is None:
        raw_payload: Mapping[str, Any] = {}
    elif isinstance(payload, Mapping):
        raw_payload = payload
    else:
        raise ProtocolMappingError(
            f"payload must be a mapping when present, got {type(payload).__name__}"
        )

    return ToolReceipt(
        protocol_version=PROTOCOL_VERSION,
        event_id=event["event_id"],
        thread_id=event["thread_id"],
        agent_id=event["agent_id"],
        seq=int(event["seq"]),
        ts=float(event["ts"]),
        turn_id=_opt_str(event.get("turn_id")),
        request_seq=(
            int(event["request_seq"])
            if isinstance(event.get("request_seq"), (int, float))
            and not isinstance(event.get("request_seq"), bool)
            else None
        ),
        is_error=bool(event.get("is_error", False)),
        summary=str(event.get("summary") or ""),
        call_id=_opt_str(raw_payload.get("call_id")),
        tool_name=_opt_str(raw_payload.get("name")) or _opt_str(raw_payload.get("tool_name")) or "",
        args=raw_payload.get("args") if "args" in raw_payload else None,
        result=raw_payload.get("result") if "result" in raw_payload else None,
        raw_payload=dict(raw_payload),
    )


def to_evidence(receipt: ToolReceipt) -> dict[str, Any]:
    """Map a ToolReceipt to Org Engine Evidence (plan §1 Evidence shape).

    Produces a stable, idempotent record: re-ingesting the same Octop event
    yields the same ``id`` and ``content_hash`` so the evidence store can
    dedupe on (id, content_hash). ``supports`` is left empty for the
    RuleEngine / DecisionPolicy to populate later.
    """
    return {
        "id": f"evidence_octop_{receipt.event_id}",
        "kind": "tool_result",
        "locator": f"octop://trajectory/{receipt.agent_id}/{receipt.thread_id}/{receipt.event_id}",
        "content_hash": _content_hash(receipt),
        "captured_at": datetime.fromtimestamp(receipt.ts, tz=timezone.utc)
        .isoformat(timespec="seconds")
        .replace("+00:00", "Z"),
        "sensitivity": "normal",
        "supports": [],
    }


def isError(receipt: ToolReceipt) -> bool:  # noqa: N802 - mirrors TS API
    """True when the receipt marks the tool execution as errored."""
    return receipt.is_error


def toolName(receipt: ToolReceipt) -> str:  # noqa: N802 - mirrors TS API
    """Return the Octop tool name for a receipt ("" when unknown)."""
    return receipt.tool_name


def protocol_version() -> str:
    """Return the protocol version this module implements."""
    return PROTOCOL_VERSION


# ---------------------------------------------------------------------------
# internals
# ---------------------------------------------------------------------------


def _content_hash(receipt: ToolReceipt) -> str:
    # Canonical form: sorted keys (recursive), compact separators, raw UTF-8.
    # The TypeScript twin uses stableStringify() with the same key order so
    # hashes match for the same receipt across both implementations.
    canonical = json.dumps(
        {
            "event_id": receipt.event_id,
            "is_error": receipt.is_error,
            "tool_name": receipt.tool_name,
            "args": receipt.args,
            "result": receipt.result,
        },
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
    )
    digest = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
    return f"sha256:{digest}"


def _require_non_empty_str(obj: Mapping[str, Any], key: str) -> None:
    v = obj.get(key)
    if not isinstance(v, str) or not v:
        raise ProtocolMappingError(f"{key} must be a non-empty string, got {type(v).__name__}")


def _require_finite_number(obj: Mapping[str, Any], key: str) -> None:
    v = obj.get(key)
    if isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v):
        raise ProtocolMappingError(f"{key} must be a finite number, got {type(v).__name__}")


def _opt_str(v: Any) -> str | None:
    return v if isinstance(v, str) and v else None
