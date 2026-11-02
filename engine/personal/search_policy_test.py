"""search_policy 测试 — 覆盖 audit Task 3 要求的六种情形。

allow / private deny / network disabled deny / unapproved provider deny /
allowed domain allow / confirmation 路径。
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from personal.search_policy import (
    SearchDecision,
    contains_private_content,
    domain_allowed,
    evaluate_search,
    redact_query,
    required_hitl_tools,
)

BASE = {
    "enabled": True, "mode": "allow", "providers": ["searchfree"],
    "allowed_domains": [], "query_data_class": "public_only",
    "max_results": 5, "recency": None,
}


class PublicQueryTest(unittest.TestCase):
    def test_public_query_allowed(self):
        d = evaluate_search(BASE, "searchfree", "Python 3.12 新特性")
        self.assertEqual(d.verdict, "allow")

    def test_query_hash_is_stable_and_not_reversible(self):
        a = evaluate_search(BASE, "searchfree", "同样的查询")
        b = evaluate_search(BASE, "searchfree", "同样的查询")
        self.assertEqual(a.query_hash, b.query_hash)
        self.assertTrue(a.query_hash.startswith("sha256:"))
        self.assertNotIn("同样的查询", a.query_hash)


class NetworkDisabledTest(unittest.TestCase):
    def test_disabled_network_denies(self):
        d = evaluate_search({**BASE, "enabled": False}, "searchfree", "公开问题")
        self.assertEqual(d.verdict, "deny")
        self.assertIn("没有开启", d.reason)

    def test_missing_policy_denies(self):
        d = evaluate_search(None, "searchfree", "公开问题")
        self.assertEqual(d.verdict, "deny")

    def test_mode_deny_denies_even_when_enabled(self):
        d = evaluate_search({**BASE, "mode": "deny"}, "searchfree", "公开问题")
        self.assertEqual(d.verdict, "deny")


class PrivacyTest(unittest.TestCase):
    def test_local_path_in_query_is_denied(self):
        d = evaluate_search(BASE, "searchfree", "帮我查 D:\\我的资料\\报销单.md 里的内容")
        self.assertEqual(d.verdict, "deny")
        self.assertIn("隐私", d.reason)

    def test_id_number_is_denied(self):
        d = evaluate_search(BASE, "searchfree", "查一下身份证 110101199001011234 的相关政策")
        self.assertEqual(d.verdict, "deny")

    def test_credential_is_denied(self):
        d = evaluate_search(BASE, "searchfree", "api_key=sk-abc123 这个怎么用")
        self.assertEqual(d.verdict, "deny")

    def test_private_forbidden_denies_everything(self):
        d = evaluate_search(
            {**BASE, "query_data_class": "private_forbidden"}, "searchfree", "完全公开的问题")
        self.assertEqual(d.verdict, "deny")

    def test_deny_happens_even_in_allow_mode(self):
        """隐私检测先于 mode：allow 也不能把本地内容发出去。"""
        d = evaluate_search({**BASE, "mode": "allow"}, "searchfree",
                            "看看 workspace/inbox/合同.pdf")
        self.assertEqual(d.verdict, "deny")

    def test_detector_does_not_flag_ordinary_text(self):
        self.assertFalse(contains_private_content("今天北京天气怎么样"))

    def test_redaction_removes_paths(self):
        out = redact_query("读 D:\\资料\\a.md 然后总结")
        self.assertNotIn("D:\\资料", out)
        self.assertIn("<redacted>", out)


class ProviderTest(unittest.TestCase):
    def test_unapproved_provider_denied(self):
        d = evaluate_search(BASE, "tavily", "公开问题")
        self.assertEqual(d.verdict, "deny")
        self.assertIn("不在允许列表", d.reason)

    def test_no_providers_configured_denies(self):
        d = evaluate_search({**BASE, "providers": []}, "searchfree", "公开问题")
        self.assertEqual(d.verdict, "deny")


class ConfirmationTest(unittest.TestCase):
    def test_ask_mode_needs_confirmation(self):
        d = evaluate_search({**BASE, "mode": "ask"}, "searchfree", "公开问题")
        self.assertEqual(d.verdict, "needs_confirmation")


class DomainTest(unittest.TestCase):
    def test_allowed_domain_passes(self):
        d = evaluate_search({**BASE, "allowed_domains": ["example.com"]},
                            "searchfree", "公开问题", requested_domains=["docs.example.com"])
        self.assertEqual(d.verdict, "allow")

    def test_unlisted_domain_denied(self):
        d = evaluate_search({**BASE, "allowed_domains": ["example.com"]},
                            "searchfree", "公开问题", requested_domains=["evil.test"])
        self.assertEqual(d.verdict, "deny")

    def test_result_domain_filter(self):
        policy = {**BASE, "allowed_domains": ["example.com"]}
        self.assertTrue(domain_allowed(policy, "https://sub.example.com/a"))
        self.assertFalse(domain_allowed(policy, "https://evil.test/a"))
        self.assertTrue(domain_allowed(BASE, "https://anywhere.test/a"))


class DeploymentContractTest(unittest.TestCase):
    def test_required_hitl_tools_lists_search_tools_only_when_enabled(self):
        self.assertEqual(required_hitl_tools(BASE), ["searchfree_search"])
        self.assertEqual(required_hitl_tools({**BASE, "enabled": False}), [])

    def test_verdict_payload_carries_no_raw_query(self):
        d = evaluate_search(BASE, "searchfree", "D:\\secret\\a.md 的内容")
        self.assertIsInstance(d, SearchDecision)
        self.assertNotIn("secret", d.query_redacted)

    def test_policy_requires_hitl_for_every_enabled_provider(self):
        """启用搜索时，必须有工具被声明为「必须走 HITL」。"""
        tools = required_hitl_tools(BASE)
        self.assertTrue(tools, "启用搜索但没有声明任何 HITL 工具，隐私策略将失效")
        self.assertIn("searchfree_search", tools)

    def test_disabled_policy_requires_no_hitl_tools(self):
        self.assertEqual(required_hitl_tools({**BASE, "enabled": False}), [])

    def test_all_search_tool_names_covers_every_provider(self):
        from personal.search_policy import SEARCH_TOOLS, all_search_tool_names

        self.assertEqual(set(all_search_tool_names()), set(SEARCH_TOOLS.keys()))


if __name__ == "__main__":
    unittest.main()
