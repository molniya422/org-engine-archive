"""Deterministic fake provider — the default for the entire test suite.

Never touches the network, never sleeps. Behavior is driven by a scripted
map of prompt-substring -> response so tests are reproducible:

    FakeProvider({
        "天气": {"json": {"task_type": "weather_reminder", ...}},
        "无效json": {"raw": "not json at all"},
        "空": {"raw": ""},
    })

Unmatched prompts raise KeyError — tests must be explicit about what they
feed the model. Timeout simulation via {"sleep_ms": N} + a per-call timeout
in options exercises the timeout path deterministically.
"""

from __future__ import annotations

import json
import time
from dataclasses import dataclass

from ..model_provider import LocalModelProvider, ProviderHealth
from ..model_types import (
    ModelCallOptions,
    ModelCapabilities,
    ModelOutputError,
    ModelResult,
    estimate_tokens,
    raw_hash,
)


@dataclass
class FakeResponse:
    raw: str | None = None            # literal text response
    json: object | None = None        # object to serialize as the response
    sleep_ms: int = 0                 # simulated latency
    unknown_model: bool = False       # raise unknown_model


class FakeProvider(LocalModelProvider):
    name = "fake"

    def __init__(self, script: dict[str, FakeResponse] | None = None,
                 models: tuple[str, ...] = ("fake-mini",),
                 context_length: int = 8192,
                 unavailable: bool = False):
        self.script = script or {}
        self._models = models
        self._context_length = context_length
        self._unavailable = unavailable
        self.calls: list[tuple[str, ModelCallOptions]] = []  # recorded for assertions

    # -- LocalModelProvider ---------------------------------------------------

    def generate_text(self, prompt: str, options: ModelCallOptions) -> ModelResult:
        self.calls.append((prompt, options))
        if self._unavailable:
            from ..model_types import ModelUnavailableError
            raise ModelUnavailableError("fake provider is configured unavailable")
        if options.model not in self._models:
            raise ModelOutputError("unknown_model", f"model not loaded: {options.model}")
        match = next((k for k in self.script if k in prompt), None)
        if match is None:
            raise KeyError(f"FakeProvider has no scripted response for prompt containing any of {list(self.script)}")
        resp = self.script[match]
        if resp.unknown_model:
            raise ModelOutputError("unknown_model", f"model not loaded: {options.model}")
        if resp.sleep_ms:
            time.sleep(resp.sleep_ms / 1000)
        text = resp.raw if resp.raw is not None else json.dumps(resp.json, ensure_ascii=False)
        return ModelResult(
            provider=self.name,
            model=options.model,
            text=text,
            parsed=None,
            latency_ms=resp.sleep_ms,
            input_tokens_est=estimate_tokens(prompt),
            output_tokens_est=estimate_tokens(text),
            raw_hash=raw_hash(text),
            schema_name=options.schema_name,
            trace_id=options.trace_id,
            temperature=options.temperature,
        )

    def health(self) -> ProviderHealth:
        if self._unavailable:
            return ProviderHealth(ok=False, detail="fake provider unavailable")
        return ProviderHealth(ok=True, detail="fake provider ready", models_loaded=self._models)

    def capabilities(self) -> ModelCapabilities:
        return ModelCapabilities(
            json_mode=True,
            context_length=self._context_length,
            supports_streaming=False,
            models=self._models,
        )
