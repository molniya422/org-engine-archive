"""Shared HTTP transport for local model adapters (Ollama / llama.cpp).

Pin: default endpoint is always 127.0.0.1 (loopback). An adapter configured
with a non-loopback host must set allow_remote=True explicitly — this encodes
the review-doc rule that "local deployment" must not silently expose a
personal-data service beyond loopback.

urllib only (no requests dependency at engine runtime); short timeouts; any
connection failure becomes ModelUnavailableError, never a silent fallback.
"""

from __future__ import annotations

import json
import time
import urllib.error
import urllib.request
from urllib.parse import urlparse

from ..model_types import ModelUnavailableError

LOOPBACK_HOSTS = {"127.0.0.1", "::1", "localhost"}


def _validate_endpoint(base_url: str, allow_remote: bool) -> None:
    parsed = urlparse(base_url)
    host = (parsed.hostname or "").lower()
    if host not in LOOPBACK_HOSTS and not allow_remote:
        raise ModelUnavailableError(
            f"refusing non-loopback model endpoint {base_url}: pass allow_remote=True explicitly"
        )


def http_json(
    method: str,
    url: str,
    payload: dict | None,
    timeout_s: float,
    allow_remote: bool = False,
) -> tuple[int, dict | list | str]:
    """POST/GET JSON; raises ModelUnavailableError on any transport failure."""
    _validate_endpoint(url, allow_remote)
    data = None
    headers = {"Content-Type": "application/json"}
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout_s) as resp:
            body = resp.read().decode("utf-8", "replace")
            status = resp.status
    except urllib.error.HTTPError as e:
        # The service answered with an error status — it IS reachable.
        body = e.read().decode("utf-8", "replace")
        return e.code, body
    except (urllib.error.URLError, TimeoutError, ConnectionError, OSError) as e:
        raise ModelUnavailableError(f"model service unreachable at {url}: {e}") from e
    try:
        return status, json.loads(body)
    except json.JSONDecodeError:
        return status, body
