"""P2.1 — LocalModelProvider contract.

The interface every local model backend must implement (Ollama, llama.cpp,
and the deterministic FakeProvider used across the whole test suite):

    generate_json(prompt, options) -> ModelResult     (schema-bound JSON)
    generate_text(prompt, options) -> ModelResult     (plain completion)
    health() -> ProviderHealth
    capabilities() -> ModelCapabilities
    close() -> None

Hard rules (plan P2.1):
- The provider NEVER opens network connections on its own beyond its
  configured local endpoint (adapters pin 127.0.0.1 by default).
- Any JSON parse failure surfaces as ModelOutputError, never a bare
  exception — callers branch on .kind.
- An unreachable backend surfaces as ModelUnavailableError — the product
  must show "local model unavailable" instead of silently using a cloud.
"""

from __future__ import annotations

import json
import time
from abc import ABC, abstractmethod
from dataclasses import dataclass

from .model_types import (
    ModelCallOptions,
    ModelCapabilities,
    ModelOutputError,
    ModelResult,
    estimate_tokens,
    raw_hash,
)


@dataclass(frozen=True)
class ProviderHealth:
    ok: bool
    detail: str
    models_loaded: tuple[str, ...] = ()

    def to_dict(self) -> dict:
        return {"ok": self.ok, "detail": self.detail, "models_loaded": list(self.models_loaded)}


class LocalModelProvider(ABC):
    """Abstract contract. Implementations: providers/fake.py (tests),
    providers/ollama.py, providers/llama_cpp.py (P2.2)."""

    name: str = "abstract"

    @abstractmethod
    def generate_text(self, prompt: str, options: ModelCallOptions) -> ModelResult:
        ...

    @abstractmethod
    def health(self) -> ProviderHealth:
        ...

    @abstractmethod
    def capabilities(self) -> ModelCapabilities:
        ...

    def close(self) -> None:  # optional cleanup
        return None

    def generate_json(self, prompt: str, options: ModelCallOptions) -> ModelResult:
        """generate_text + strict JSON parse. Never returns a non-JSON result."""
        started = time.monotonic()
        result = self.generate_text(prompt, options)
        latency_ms = result.latency_ms or int((time.monotonic() - started) * 1000)
        text = result.text.strip()
        if not text:
            raise ModelOutputError("empty_output", "model returned an empty response")
        try:
            parsed = json.loads(text)
        except json.JSONDecodeError as e:
            raise ModelOutputError(
                "json_invalid",
                f"model output is not valid JSON: {e.msg} at position {e.pos}",
                raw=text,
            ) from e
        return ModelResult(
            provider=result.provider,
            model=result.model,
            text=text,
            parsed=parsed,
            latency_ms=latency_ms,
            input_tokens_est=result.input_tokens_est,
            output_tokens_est=result.output_tokens_est,
            raw_hash=result.raw_hash,
            schema_name=options.schema_name,
            trace_id=options.trace_id,
            temperature=options.temperature,
        )
