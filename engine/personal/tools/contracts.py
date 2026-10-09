"""P5.1 — tool contracts.

A ToolContract declares what a tool is (schemas, risk, scopes, verifier) and
WHEN to use it — descriptions guide invocation decisions, not just capability
listing. Every ToolCall / ToolResult records sha256 hashes of parameters and
output so every invocation is auditable and replayable.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from typing import Any, Callable


def _hash(obj: Any) -> str:
    return hashlib.sha256(json.dumps(obj, sort_keys=True, ensure_ascii=False).encode("utf-8")).hexdigest()


@dataclass(frozen=True)
class ToolContract:
    name: str
    risk_level: str                      # low | medium | high
    input_schema: dict[str, Any]
    output_schema: dict[str, Any]
    required_scopes: tuple[str, ...]
    verifier: str                        # verifier name in tools/verifiers.py
    when_to_use: str                     # 什么时候使用 — required, non-empty

    def __post_init__(self) -> None:
        if not self.when_to_use or not self.when_to_use.strip():
            raise ValueError(f"tool '{self.name}': when_to_use is required — descriptions must say when to use the tool, not just what it does")
        if self.risk_level not in ("low", "medium", "high"):
            raise ValueError(f"tool '{self.name}': unknown risk_level '{self.risk_level}'")

    def to_dict(self) -> dict[str, Any]:
        return {
            "name": self.name, "risk_level": self.risk_level,
            "input_schema": self.input_schema, "output_schema": self.output_schema,
            "required_scopes": list(self.required_scopes),
            "verifier": self.verifier, "when_to_use": self.when_to_use,
        }


@dataclass(frozen=True)
class ToolCall:
    tool: str
    parameters: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {"tool": self.tool, "parameters": self.parameters,
                "parameters_hash": _hash(self.parameters)}


@dataclass(frozen=True)
class ToolResult:
    ok: bool
    output: dict[str, Any] = field(default_factory=dict)
    error: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {"ok": self.ok, "output": self.output, "error": self.error,
                "result_hash": _hash(self.output)}


Executor = Callable[[dict[str, Any]], dict[str, Any]]
