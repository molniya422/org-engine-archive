"""P2.2 — llama.cpp server adapter (LocalModelProvider over llama-server HTTP).

Endpoint: http://127.0.0.1:8080 (llama.cpp default; override with base_url,
non-loopback needs allow_remote=True). Same contract as OllamaProvider.

- generate_text: POST /v1/chat/completions (OpenAI-compatible) or /completion;
  we use /completion (native, simpler response shape).
- health: GET /health — llama-server returns 200 when ready, 503 while loading.
- capabilities: context length from /props when available.
"""

from __future__ import annotations

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
from .http_transport import http_json

DEFAULT_BASE_URL = "http://127.0.0.1:8080"
FALLBACK_CONTEXT = 4096


@dataclass
class LlamaCppProvider(LocalModelProvider):
    name: str = "llama.cpp"
    base_url: str = DEFAULT_BASE_URL
    default_model: str = "local"   # llama-server serves one model; name is nominal
    allow_remote: bool = False
    timeout_s: float = 120.0

    # -- LocalModelProvider ---------------------------------------------------

    def generate_text(self, prompt: str, options: ModelCallOptions) -> ModelResult:
        model = options.model or self.default_model
        started = time.monotonic()
        status, body = http_json(
            "POST",
            f"{self.base_url}/completion",
            {
                "prompt": prompt,
                "temperature": options.temperature,
                "n_predict": options.max_tokens,
                "cache_prompt": True,
            },
            timeout_s=min(options.timeout_ms / 1000, self.timeout_s),
            allow_remote=self.allow_remote,
        )
        latency_ms = int((time.monotonic() - started) * 1000)
        if status != 200 or not isinstance(body, dict):
            msg = body.get("error", {}).get("message", "") if isinstance(body, dict) else str(body)[:200]
            raise ModelUnavailableError(f"llama.cpp completion failed (HTTP {status}): {msg}")
        text = str(body.get("content", ""))
        tokens_in = int(body.get("tokens_evaluated", 0)) or estimate_tokens(prompt)
        tokens_out = int(body.get("tokens_predicted", 0)) or estimate_tokens(text)
        return ModelResult(
            provider=self.name,
            model=model,
            text=text,
            parsed=None,
            latency_ms=latency_ms,
            input_tokens_est=tokens_in,
            output_tokens_est=tokens_out,
            raw_hash=raw_hash(text),
            schema_name=options.schema_name,
            trace_id=options.trace_id,
            temperature=options.temperature,
        )

    def health(self) -> ProviderHealth:
        try:
            status, body = http_json("GET", f"{self.base_url}/health", None, 3.0, self.allow_remote)
        except ModelUnavailableError as e:
            return ProviderHealth(ok=False, detail=str(e))
        if status == 200:
            return ProviderHealth(ok=True, detail="llama.cpp ready", models_loaded=(self.default_model,))
        if status == 503:
            return ProviderHealth(ok=False, detail="llama.cpp is loading the model (503)")
        return ProviderHealth(ok=False, detail=f"llama.cpp /health returned HTTP {status}")

    def capabilities(self) -> ModelCapabilities:
        context = FALLBACK_CONTEXT
        try:
            status, body = http_json("GET", f"{self.base_url}/props", None, 3.0, self.allow_remote)
            if status == 200 and isinstance(body, dict):
                ctx = body.get("default_generation_settings", {}).get("n_ctx") or body.get("total_slots") and None
                if ctx:
                    context = int(ctx)
        except ModelUnavailableError:
            pass
        return ModelCapabilities(json_mode=False, context_length=context, supports_streaming=True)
