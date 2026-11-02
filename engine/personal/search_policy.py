"""P4.5 — search policy: 外发查询的唯一裁决点。

分工（audit Gate S）：
- Octop 执行搜索（provider/tool 在 Octop 侧），Org Engine 不复制搜索实现；
- Org Engine 只决定：是否允许联网、允许哪些 provider、查询里能不能带本地内容、
  结果域名是否可引用。

红线：
1. 默认 deny——没有显式 network_policy 的任务永不联网；
2. 查询里出现本地路径/密钥/身份证等私密内容 → deny（不是"脱敏后照发"）；
3. `private_forbidden` 数据级别下任何搜索都 deny；
4. 未知 provider 一律 deny；
5. allow 只代表"这一条查询在策略上允许"，不代表结果可信——引用仍需 SearchReceipt。

注：运行时门禁依赖 Octop 把搜索工具纳入 HITL。若 Octop 全局 HITL 未包含搜索工具，
工具会在无门禁下执行，本模块只能在 plan 阶段前置拒绝。`required_hitl_tools()`
给出部署时应纳入全局 HITL 的工具清单。
"""

from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass
from typing import Any, Iterable

# Octop 侧搜索工具 → Org Engine 能力名。搜索不是 external_send：它是"读外部"，
# 风险为中；外发的是查询本身，故仍受 network_policy 约束。
SEARCH_TOOLS: dict[str, str] = {
    "searchfree_search": "searchfree",
    "tavily_search": "tavily",
    "brave_search": "brave",
    "google_search": "google",
    "kimi_search": "kimi",
    "web_fetch": "web_fetch",
}

SEARCH_VERDICTS = frozenset({"allow", "needs_confirmation", "deny"})

# 私密内容检测：宁可误判成私密（拒绝），也不要把本地内容发出去。
_PRIVATE_PATTERNS = (
    re.compile(r"[A-Za-z]:[\\/][^\s，。；,;]*"),              # C:\dir\file 整段
    re.compile(r"(?<![\w.])/(?:inbox|workspace|mnt|home|Users)(?:/[^\s，。；,;]*)?"),
    re.compile(r"[\w.-]+\.(md|txt|csv|docx?|xlsx?|pdf)\b"),  # 本地文件名
    re.compile(r"\d{17}[\dXx]|\d{15}"),                      # 身份证
    re.compile(r"(?i)\b(api[_-]?key|secret|token|password|passwd)\b\s*[:=]\s*\S+"),
)
_PRIVATE_WORDS = ("身份证", "银行卡", "工资条", "密码是", "私钥", "密钥是")


def _query_hash(text: str) -> str:
    return "sha256:" + hashlib.sha256(text.encode("utf-8")).hexdigest()


def contains_private_content(query: str) -> bool:
    """查询里是否携带本地路径、文件名、证件号或凭据。"""
    if any(p.search(query) for p in _PRIVATE_PATTERNS):
        return True
    return any(w in query for w in _PRIVATE_WORDS)


def redact_query(query: str) -> str:
    """给普通 trace 用的脱敏文本：抹掉路径与证件号，不保留原文。"""
    out = query
    for pat in _PRIVATE_PATTERNS:
        out = pat.sub("<redacted>", out)
    for w in _PRIVATE_WORDS:
        out = out.replace(w, "<redacted>")
    return out.strip()


@dataclass(frozen=True)
class SearchDecision:
    verdict: str                 # allow | needs_confirmation | deny
    reason: str                  # 用户可读中文
    provider: str
    query_hash: str
    query_redacted: str

    def __post_init__(self) -> None:
        if self.verdict not in SEARCH_VERDICTS:
            raise ValueError(f"invalid search verdict {self.verdict!r}")


def _policy_of(policy: Any) -> dict[str, Any]:
    if not isinstance(policy, dict):
        return {"enabled": False, "mode": "deny", "providers": [],
                "allowed_domains": [], "query_data_class": "public_only",
                "max_results": 5, "recency": None}
    return policy


def evaluate_search(
    policy: Any,
    provider: str,
    query: str,
    *,
    requested_domains: Iterable[str] = (),
) -> SearchDecision:
    """裁决一条即将外发的搜索查询。

    `provider` 既接受 Org Engine 能力名（searchfree/tavily），也接受 Octop 的
    工具名（searchfree_search）——调用方常直接拿 tool name，避免双份映射表。

    顺序固定：联网开关 → 数据级别 → 私密内容 → provider 白名单 → mode → 域名。
    私密内容先于 mode 判断：即使 mode=allow 也不允许把本地内容发出去。
    """
    p = _policy_of(policy)
    provider = SEARCH_TOOLS.get(provider, provider)
    q = query or ""
    redacted = redact_query(q)
    qhash = _query_hash(q)

    def deny(reason: str) -> SearchDecision:
        return SearchDecision("deny", reason, provider, qhash, redacted)

    if not p.get("enabled", False):
        return deny("联网能力没有开启，无法搜索。")
    if p.get("query_data_class") == "private_forbidden":
        return deny("当前设置禁止把任何本地内容用于联网查询。")
    if contains_private_content(q):
        return deny("查询里包含本地文件或隐私内容，已阻止外发。")
    providers = list(p.get("providers") or [])
    if not providers:
        return deny("没有配置允许的搜索来源，无法搜索。")
    if provider not in providers:
        return deny(f"搜索来源「{provider}」不在允许列表里。")
    mode = p.get("mode", "deny")
    if mode == "deny":
        return deny("当前设置为不允许联网。")

    domains = list(p.get("allowed_domains") or [])
    if domains:
        requested = [d.lower().lstrip(".") for d in requested_domains]
        allowed = [d.lower().lstrip(".") for d in domains]
        outside = [d for d in requested if not any(d == a or d.endswith("." + a) for a in allowed)]
        if outside:
            return deny(f"这些网站不在允许范围：{', '.join(outside)}。")

    if mode == "ask":
        return SearchDecision(
            "needs_confirmation",
            "需要你确认后才会把这条查询发送出去。",
            provider, qhash, redacted,
        )
    return SearchDecision("allow", "允许搜索。", provider, qhash, redacted)


def domain_allowed(policy: Any, url: str) -> bool:
    """结果域名过滤：allowed_domains 为空表示不限制；否则必须命中。"""
    from urllib.parse import urlparse

    domains = list(_policy_of(policy).get("allowed_domains") or [])
    if not domains:
        return True
    host = (urlparse(url).hostname or "").lower()
    return any(host == d.lower().lstrip(".") or host.endswith("." + d.lower().lstrip("."))
               for d in domains)


def required_hitl_tools(policy: Any) -> list[str]:
    """部署时需纳入 Octop 全局 HITL 的工具——否则门禁看不到搜索调用。"""
    p = _policy_of(policy)
    if not p.get("enabled", False):
        return []
    providers = set(p.get("providers") or [])
    return [tool for tool, provider in SEARCH_TOOLS.items() if provider in providers]


def all_search_tool_names() -> tuple[str, ...]:
    """Octop 侧所有可能的搜索/抓取工具名。

    预检必须覆盖全部，而不能只覆盖 network_policy 里配置的 provider：
    agent 上挂载了未配置的搜索工具时，该工具仍会被模型直接调用。
    """
    return tuple(SEARCH_TOOLS.keys())
