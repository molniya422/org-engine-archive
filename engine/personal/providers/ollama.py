"""P2.2 — Ollama adapter (LocalModelProvider over the Ollama HTTP API).

Endpoint: http://127.0.0.1:11434 (override with base_url; non-loopback needs
allow_remote=True). Implements the same contract as FakeProvider.

- generate_text: POST /api/generate (stream=false)
- health: GET /api/tags — ok when the service answers; models_loaded from tags
- capabilities: json_mode=True (Ollama supports "format": "json"),
  context_length from /api/show when available, else a conservative default
- local_only: this adapter has no cloud path by construction; the refusal of
  non-loopback endpoints is enforced in http_transport.
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
    ModelUnavailableError,
    estimate_tokens,
    raw_hash,
)
from .http_transport import http_json, LOOPBACK_HOSTS

DEFAULT_BASE_URL = "http://127.0.0.1:11434"
FALLBACK_CONTEXT = 8192


@dataclass
class OllamaProvider(LocalModelProvider):
    name: str = "ollama"
    base_url: str = DEFAULT_BASE_URL
    default_model: str = ""
    allow_remote: bool = False
    timeout_s: float = 120.0

    # -- LocalModelProvider ---------------------------------------------------

    def generate_text(self, prompt: str, options: ModelCallOptions) -> ModelResult:
        model = options.model or self.default_model
        if not model:
            raise ModelOutputError("unknown_model", "no model specified and no default_model configured")
        started = time.monotonic()
        status, body = http_json(
            "POST",
            f"{self.base_url}/api/generate",
            {
                "model": model,
                "prompt": prompt,
                "stream": False,
                "format": "json" if options.schema_name else None,
                "options": {
                    "temperature": options.temperature,
                    "num_predict": options.max_tokens,
                },
            },
            timeout_s=min(options.timeout_ms / 1000, self.timeout_s),
            allow_remote=self.allow_remote,
        )
        latency_ms = int((time.monotonic() - started) * 1000)
        if status != 200 or not isinstance(body, dict):
            # 404 model not found is a typed model error; anything else on a
            # reachable service is surfaced with its status for diagnosis.
            msg = body.get("error", "") if isinstance(body, dict) else str(body)[:200]
            if status == 404 or "not found" in str(msg).lower():
                raise ModelOutputError("unknown_model", f"ollama model not loaded: {model} ({msg})")
            raise ModelUnavailableError(f"ollama generate failed (HTTP {status}): {msg}")
        text = str(body.get("response", ""))
        if body.get("error"):
            raise ModelOutputError("empty_output", str(body["error"]))
        return ModelResult(
            provider=self.name,
            model=model,
            text=text,
            parsed=None,
            latency_ms=latency_ms,
            input_tokens_est=int(body.get("prompt_eval_count", 0)) or estimate_tokens(prompt),
            output_tokens_est=int(body.get("eval_count", 0)) or estimate_tokens(text),
            raw_hash=raw_hash(text),
            schema_name=options.schema_name,
            trace_id=options.trace_id,
            temperature=options.temperature,
        )

    def health(self) -> ProviderHealth:
        try:
            status, body = http_json("GET", f"{self.base_url}/api/tags", None, 3.0, self.allow_remote)
        except ModelUnavailableError as e:
            return ProviderHealth(ok=False, detail=str(e))
        if status != 200 or not isinstance(body, dict):
            return ProviderHealth(ok=False, detail=f"ollama /api/tags returned HTTP {status}")
        models = tuple(m.get("name", "?") for m in body.get("models", []))
        return ProviderHealth(ok=True, detail="ollama reachable", models_loaded=models)

    def capabilities(self) -> ModelCapabilities:
        context = FALLBACK_CONTEXT
        model = self.default_model
        if model:
            try:
                status, body = http_json("POST", f"{self.base_url}/api/show", {"model": model}, 3.0, self.allow_remote)
                if status == 200 and isinstance(body, dict):
                    context = int(body.get("model_info", {}).get("general.context_length", FALLBACK_CONTEXT))
            except ModelUnavailableError:
                pass
        return ModelCapabilities(json_mode=True, context_length=context, supports_streaming=True)

    def json_mode_native(self) -> bool:
        """Ollama supports structured output natively via format json/schema."""
        return True
