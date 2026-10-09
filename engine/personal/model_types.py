"""P2.1 — model output types for the LocalModelProvider contract.

Every provider result carries provenance (provider, model, latency, token
estimates, raw hash) so the decision layer can put exact versions into a
DecisionTrace. JSON parse failures are typed (ModelOutputError), never
bare exceptions — callers branch on the type, not on string matching.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from typing import Any, Literal


class ModelOutputError(Exception):
    """The model returned something that could not be parsed as required.

    kind distinguishes the failure mode so the caller can decide between
    one repair attempt (schema_violation / json_invalid) and immediate
    clarification (empty_output / timeout / unknown_model).
    """

    def __init__(self, kind: Literal[
        "json_invalid", "schema_violation", "empty_output",
        "timeout", "unknown_model", "provider_unavailable",
    ], message: str, raw: str | None = None):
        super().__init__(message)
        self.kind = kind
        self.raw = raw


class ModelUnavailableError(Exception):
    """The provider backend itself is unreachable (service down, offline).

    The product contract (plan §3): when the local model is unavailable the
    system must SAY so and offer rules/manual mode — never silently fall
    back to a cloud endpoint. Callers translate this into an explicit
    blocked/clarify state.
    """


@dataclass(frozen=True)
class ModelCallOptions:
    """Per-call parameters. Every call carries them; no provider-global state."""
    model: str
    schema_name: str | None = None      # which P2.3 schema the output must satisfy
    trace_id: str | None = None
    temperature: float = 0.0
    timeout_ms: int = 30_000
    max_tokens: int = 2_048


@dataclass(frozen=True)
class ModelCapabilities:
    json_mode: bool
    context_length: int
    supports_streaming: bool = False
    models: tuple[str, ...] = ()

    def to_dict(self) -> dict:
        return {
            "json_mode": self.json_mode,
            "context_length": self.context_length,
            "supports_streaming": self.supports_streaming,
            "models": list(self.models),
        }


@dataclass(frozen=True)
class ModelResult:
    """Provenance-complete result of one generation call."""
    provider: str
    model: str
    text: str
    parsed: Any | None                  # set when JSON was requested and valid
    latency_ms: int
    input_tokens_est: int
    output_tokens_est: int
    raw_hash: str                       # sha256 of the raw response text
    schema_name: str | None = None
    trace_id: str | None = None
    temperature: float = 0.0

    def to_dict(self) -> dict:
        return {
            "provider": self.provider,
            "model": self.model,
            "latency_ms": self.latency_ms,
            "input_tokens_est": self.input_tokens_est,
            "output_tokens_est": self.output_tokens_est,
            "raw_hash": self.raw_hash,
            "schema_name": self.schema_name,
            "trace_id": self.trace_id,
            "temperature": self.temperature,
            "parsed": self.parsed,
        }


def estimate_tokens(text: str) -> int:
    """Cheap deterministic token estimate (~4 chars/token, CJK ~1.5 chars/token).

    Only used for budget accounting, never for correctness decisions.
    """
    if not text:
        return 0
    cjk = sum(1 for ch in text if "一" <= ch <= "鿿")
    other = len(text) - cjk
    return max(1, cjk // 2 + other // 4)


def raw_hash(text: str) -> str:
    return "sha256:" + hashlib.sha256(text.encode("utf-8")).hexdigest()
