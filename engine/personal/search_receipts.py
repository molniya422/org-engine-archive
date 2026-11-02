"""P4.6 — SearchReceipt：把一次搜索工具调用投影成可引用、可审计的证据。

为什么不复用通用 tool_result Evidence：
- 通用 Evidence 只留 locator + hash，用户看不到"答案来自哪里"；
- 搜索需要 query 的**脱敏文本 + hash**、provider、结果 URL/标题、抓取时间，
  以及"这条查询是否被批准外发"的决策记录。

红线：
1. 原始 query 不落普通 trace——只落 query_hash 与脱敏文本；
2. 结果条目必须带 URL，否则不能作为引用；
3. 没有 SearchReceipt 的"外部事实"一律不能标 verified（由调用方保证）。
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Mapping

from .search_policy import domain_allowed, redact_query

SEARCH_PROTOCOL_VERSION = "octop-org-search-1"


def _canonical(obj: Any) -> str:
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def _sha(text: str) -> str:
    return "sha256:" + hashlib.sha256(text.encode("utf-8")).hexdigest()


def query_hash(query: str) -> str:
    return _sha(query)


@dataclass(frozen=True)
class SearchResultItem:
    url: str
    title: str = ""
    snippet: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {"url": self.url, "title": self.title, "snippet": self.snippet}


@dataclass
class SearchReceipt:
    protocol_version: str
    event_id: str
    provider: str
    query_hash: str
    query_redacted: str
    results: list[SearchResultItem] = field(default_factory=list)
    captured_at: str = ""
    request_hash: str = ""
    response_hash: str = ""
    external_data_decision: str = "denied"   # allowed | confirmed | denied

    def __post_init__(self) -> None:
        if self.protocol_version != SEARCH_PROTOCOL_VERSION:
            raise ValueError(f"unsupported search protocol {self.protocol_version!r}")
        if self.external_data_decision not in ("allowed", "confirmed", "denied"):
            raise ValueError(
                f"external_data_decision must be allowed|confirmed|denied, got {self.external_data_decision!r}"
            )

    def to_dict(self) -> dict[str, Any]:
        return {
            "protocol_version": self.protocol_version,
            "event_id": self.event_id,
            "provider": self.provider,
            "query_hash": self.query_hash,
            "query_redacted": self.query_redacted,
            "results": [r.to_dict() for r in self.results],
            "captured_at": self.captured_at,
            "request_hash": self.request_hash,
            "response_hash": self.response_hash,
            "external_data_decision": self.external_data_decision,
        }


def _iter_results(payload: Any) -> list[dict[str, Any]]:
    """Octop 搜索工具返回形态。

    实机验证（Gate S 2026-10-24）：`searchfree_search` 的 `result` 是
    **JSON 字符串**（例如 ``'[{"title":..,"url":..,"snippet":..}]'``），
    不是 dict。另外也兼容 list / {results: [...]} / {items: [...]} / 字符串化的这两种。
    """
    if isinstance(payload, str):
        text = payload.strip()
        if not text or text.startswith("Error:"):
            return []
        try:
            return _iter_results(json.loads(text))
        except json.JSONDecodeError:
            return []
    if isinstance(payload, list):
        return [r for r in payload if isinstance(r, dict)]
    if isinstance(payload, Mapping):
        for key in ("results", "items", "data"):
            v = payload.get(key)
            if isinstance(v, list):
                return [r for r in v if isinstance(r, dict)]
            if isinstance(v, str):
                return _iter_results(v)
    return []


def _item_from_result(raw: Mapping[str, Any]) -> SearchResultItem | None:
    url = raw.get("url") or raw.get("link") or raw.get("href")
    if not isinstance(url, str) or not url.startswith(("http://", "https://")):
        return None
    title = raw.get("title") or raw.get("name") or ""
    snippet = raw.get("snippet") or raw.get("content") or raw.get("description") or ""
    return SearchResultItem(str(url), str(title), str(snippet))


def search_receipt_from_receipt(
    *,
    event_id: str,
    tool_name: str,
    args: Any,
    result: Any,
    captured_at: str | None = None,
    external_data_decision: str = "allowed",
    policy: Any = None,
) -> SearchReceipt | None:
    """通用 tool receipt → SearchReceipt；非搜索工具返回 None。

    `policy` 提供时按 allowed_domains 过滤结果（过滤掉的结果不进入引用）。
    """
    from .search_policy import SEARCH_TOOLS

    if tool_name not in SEARCH_TOOLS:
        return None
    provider = SEARCH_TOOLS[tool_name]
    a = args if isinstance(args, Mapping) else {}
    query = str(a.get("query") or a.get("q") or "")
    items = []
    for raw in _iter_results(result):
        item = _item_from_result(raw)
        if item is None:
            continue
        if policy is not None and not domain_allowed(policy, item.url):
            continue
        items.append(item)
    captured = captured_at or datetime.now(tz=timezone.utc).isoformat(
        timespec="seconds").replace("+00:00", "Z")
    return SearchReceipt(
        protocol_version=SEARCH_PROTOCOL_VERSION,
        event_id=event_id,
        provider=provider,
        query_hash=query_hash(query),
        query_redacted=redact_query(query),
        results=items,
        captured_at=captured,
        request_hash=_sha(_canonical({"provider": provider, "query": query})),
        response_hash=_sha(_canonical(result if result is not None else {})),
        external_data_decision=external_data_decision,
    )


def search_evidence_of(receipt: SearchReceipt) -> dict[str, Any]:
    """SearchReceipt → Evidence 记录（kind 保持 tool_result，引用信息进 locator 摘要）。

    现有 SQLite evidence 表只认固定列；搜索专用字段通过 locator 与
    content_hash 保持可追溯，完整 SearchReceipt 由 trace 携带。
    """
    return {
        "id": f"evidence_search_{receipt.event_id}",
        "kind": "tool_result",
        "locator": f"search://{receipt.provider}/{receipt.event_id}",
        "content_hash": receipt.response_hash or _sha(_canonical(receipt.to_dict())),
        "captured_at": receipt.captured_at,
        "sensitivity": "normal",
        "supports": [],
    }
