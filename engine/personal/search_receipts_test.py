"""search_receipts 测试 — 引用可追溯、原文不外泄、域名过滤。"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from personal.search_receipts import (
    SEARCH_PROTOCOL_VERSION,
    SearchReceipt,
    search_evidence_of,
    search_receipt_from_receipt,
)

POLICY = {"enabled": True, "mode": "allow", "providers": ["searchfree"],
          "allowed_domains": [], "query_data_class": "public_only",
          "max_results": 5, "recency": None}

RAW_RESULT = {
    "results": [
        {"url": "https://example.com/a", "title": "A 页面", "content": "摘要 A"},
        {"url": "https://other.test/b", "title": "B 页面", "snippet": "摘要 B"},
        {"title": "没有 URL 的条目"},
    ]
}


class SearchReceiptTest(unittest.TestCase):
    def test_builds_receipt_with_sources(self):
        r = search_receipt_from_receipt(
            event_id="live:T:c1", tool_name="searchfree_search",
            args={"query": "公开技术问题"}, result=RAW_RESULT,
            captured_at="2026-10-18T00:00:00Z",
        )
        assert r is not None
        self.assertEqual(r.protocol_version, SEARCH_PROTOCOL_VERSION)
        self.assertEqual(r.provider, "searchfree")
        self.assertEqual(len(r.results), 2)          # 无 URL 的条目被丢弃
        self.assertEqual(r.results[0].url, "https://example.com/a")
        self.assertEqual(r.external_data_decision, "allowed")

    def test_raw_query_never_stored(self):
        r = search_receipt_from_receipt(
            event_id="e1", tool_name="searchfree_search",
            args={"query": "D:\\私密\\合同.pdf 说了什么"}, result=RAW_RESULT,
        )
        assert r is not None
        self.assertNotIn("私密", r.query_redacted)
        self.assertNotIn("合同", r.query_redacted)
        self.assertTrue(r.query_hash.startswith("sha256:"))

    def test_non_search_tool_returns_none(self):
        self.assertIsNone(search_receipt_from_receipt(
            event_id="e1", tool_name="read_file",
            args={"path": "/a.md"}, result="content",
        ))

    def test_domain_filter_drops_disallowed_results(self):
        r = search_receipt_from_receipt(
            event_id="e1", tool_name="searchfree_search",
            args={"query": "公开问题"}, result=RAW_RESULT,
            policy={**POLICY, "allowed_domains": ["example.com"]},
        )
        assert r is not None
        self.assertEqual([x.url for x in r.results], ["https://example.com/a"])

    def test_parses_json_string_result(self):
        """实机形态：searchfree_search 返回 JSON 字符串，不是 dict。"""
        raw = '[{"title":"A","url":"https://a.test/1","snippet":"摘要"},' \
              '{"title":"B","url":"https://b.test/2","snippet":"摘要2"}]'
        r = search_receipt_from_receipt(
            event_id="e1", tool_name="searchfree_search",
            args={"query": "公开问题"}, result=raw,
        )
        assert r is not None
        self.assertEqual([x.url for x in r.results], ["https://a.test/1", "https://b.test/2"])

    def test_error_string_yields_no_results(self):
        r = search_receipt_from_receipt(
            event_id="e1", tool_name="searchfree_search",
            args={"query": "公开问题"},
            result="Error: searchfree request failed: Server disconnected",
        )
        assert r is not None
        self.assertEqual(r.results, [])

    def test_non_json_string_yields_no_results(self):
        r = search_receipt_from_receipt(
            event_id="e1", tool_name="searchfree_search",
            args={"query": "q"}, result="some plain text without urls",
        )
        assert r is not None
        self.assertEqual(r.results, [])

    def test_invalid_decision_is_rejected(self):
        with self.assertRaises(ValueError):
            SearchReceipt(
                protocol_version=SEARCH_PROTOCOL_VERSION, event_id="e",
                provider="searchfree", query_hash="sha256:x", query_redacted="",
                external_data_decision="maybe",
            )

    def test_evidence_is_stable_for_same_receipt(self):
        kw = dict(event_id="e1", tool_name="searchfree_search",
                  args={"query": "q"}, result=RAW_RESULT,
                  captured_at="2026-10-18T00:00:00Z")
        a = search_receipt_from_receipt(**kw)
        b = search_receipt_from_receipt(**kw)
        assert a is not None and b is not None
        self.assertEqual(search_evidence_of(a), search_evidence_of(b))
        ev = search_evidence_of(a)
        self.assertTrue(ev["content_hash"].startswith("sha256:"))
        self.assertTrue(ev["locator"].startswith("search://searchfree/"))

    def test_query_hash_is_reproducible_across_instances(self):
        a = search_receipt_from_receipt(event_id="e1", tool_name="searchfree_search",
                                        args={"query": "同样的查询"}, result=RAW_RESULT)
        b = search_receipt_from_receipt(event_id="e2", tool_name="searchfree_search",
                                        args={"query": "同样的查询"}, result=RAW_RESULT)
        assert a is not None and b is not None
        self.assertEqual(a.query_hash, b.query_hash)


if __name__ == "__main__":
    unittest.main()
