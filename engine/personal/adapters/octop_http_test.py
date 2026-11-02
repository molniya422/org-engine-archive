"""OctopHttpClient 的 preflight 与 HITL 声明测试（不起真 Octop）。"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from personal.adapters.octop_http import (
    AgentPreflight,
    OctopHttpClient,
    OctopPreflightError,
)


class PreflightTest(unittest.TestCase):
    def _client(self):
        return OctopHttpClient("http://127.0.0.1:8088", "u", "p", timeout_s=1)

    def test_preflight_reports_missing_search_tool(self):
        client = self._client()
        client._token = "jwt"
        with mock.patch.object(client, "agent_tool_names", return_value={"write_file", "read_file"}):
            with mock.patch.object(client, "global_hitl_tools", return_value={"write_file"}):
                report = client.agent_preflight("A1", required_tools=("searchfree_search",))
        self.assertFalse(report.ok)
        self.assertIn("searchfree_search", report.missing_tools)

    def test_preflight_reports_search_tool_not_in_hitl(self):
        """搜索工具存在但不在 HITL 清单 → 隐私策略无法生效 → 不 ok。"""
        client = self._client()
        client._token = "jwt"
        with mock.patch.object(client, "agent_tool_names", return_value={"searchfree_search"}):
            with mock.patch.object(client, "global_hitl_tools", return_value={"write_file"}):
                report = client.agent_preflight("A1", required_tools=("searchfree_search",))
        self.assertFalse(report.ok)
        self.assertIn("searchfree_search", report.tools_outside_hitl)

    def test_preflight_ok_when_tool_present_and_gated(self):
        client = self._client()
        client._token = "jwt"
        with mock.patch.object(client, "agent_tool_names", return_value={"searchfree_search"}):
            with mock.patch.object(client, "global_hitl_tools",
                                   return_value={"write_file", "searchfree_search"}):
                report = client.agent_preflight("A1", required_tools=("searchfree_search",))
        self.assertTrue(report.ok)
        self.assertEqual(report.missing_tools, [])
        self.assertEqual(report.tools_outside_hitl, [])

    def test_preflight_with_no_required_tools_is_ok(self):
        """没开搜索时不要求任何工具，也不该因为工具缺失而拒绝任务。"""
        client = self._client()
        client._token = "jwt"
        with mock.patch.object(client, "agent_tool_names", return_value=set()):
            with mock.patch.object(client, "global_hitl_tools", return_value=set()):
                report = client.agent_preflight("A1", required_tools=())
        self.assertTrue(report.ok)

    def test_preflight_gates_all_mounted_search_tools_even_if_not_required(self):
        """agent 挂载了未配置的搜索工具 → 仍必须被 HITL 拦住，否则可绕过隐私检查。"""
        client = self._client()
        client._token = "jwt"
        with mock.patch.object(client, "agent_tool_names",
                               return_value={"tavily_search", "write_file"}):
            with mock.patch.object(client, "global_hitl_tools", return_value={"write_file"}):
                report = client.agent_preflight(
                    "A1", required_tools=(), gate_all_search_tools=True)
        self.assertFalse(report.ok)
        self.assertEqual(report.tools_outside_hitl, ["tavily_search"])

    def test_preflight_passes_when_no_search_tools_mounted(self):
        """agent 上没有任何搜索工具 → 无需任何 HITL 声明，不误伤。"""
        client = self._client()
        client._token = "jwt"
        with mock.patch.object(client, "agent_tool_names", return_value={"write_file"}):
            with mock.patch.object(client, "global_hitl_tools", return_value={"write_file"}):
                report = client.agent_preflight(
                    "A1", required_tools=(), gate_all_search_tools=True)
        self.assertTrue(report.ok)
        self.assertEqual(report.tools_outside_hitl, [])

    def test_preflight_raises_on_non_loopback(self):
        with self.assertRaises(Exception):
            OctopHttpClient("http://10.0.0.5:8088", "u", "p")

    def test_as_dict_is_json_safe(self):
        report = AgentPreflight(
            ok=False, agent_id="A1", tool_count=3,
            missing_tools=["searchfree_search"], tools_outside_hitl=["searchfree_search"],
        )
        d = report.as_dict()
        self.assertEqual(d["agent_id"], "A1")
        self.assertFalse(d["ok"])

    def test_global_hitl_tools_expands_default(self):
        """`tools: "default"` 必须展开成 harness 内置的 5 个工具。"""
        client = self._client()
        client._token = "jwt"
        with mock.patch.object(client, "_request",
                               return_value={"hitl": {"enabled": True, "tools": "default"}}):
            tools = client.global_hitl_tools()
        self.assertEqual(tools, {"bash", "execute", "write_file", "edit_file", "delete"})

    def test_global_hitl_tools_empty_when_disabled(self):
        client = self._client()
        client._token = "jwt"
        with mock.patch.object(client, "_request",
                               return_value={"hitl": {"enabled": False, "tools": ["write_file"]}}):
            self.assertEqual(client.global_hitl_tools(), set())

    def test_agent_tool_names_ignores_disabled_and_unavailable_tools(self):
        """tool-settings 里存在但被禁用/不可用的工具，不算"挂载"。"""
        client = self._client()
        client._token = "jwt"
        payload = {"tools": [
            {"name": "searchfree_search", "enabled": True, "available": True},
            {"name": "tavily_search", "enabled": False, "available": True},
            {"name": "brave_search", "enabled": True, "available": False},
            {"name": "read_file", "enabled": True},
        ]}
        with mock.patch.object(client, "_request", return_value=payload):
            names = client.agent_tool_names("A1")
        self.assertEqual(names, {"searchfree_search", "read_file"})

    def test_ensure_hitl_tools_merges_without_dropping_existing_settings(self):
        """收紧而非放松：并入搜索工具，保留既有工具与其他策略段。"""
        client = self._client()
        client._token = "jwt"
        current = {
            "hitl": {"enabled": False, "tools": ["write_file"],
                     "allowed_decisions": ["approve", "reject"]},
            "filesystem": {"enabled": True, "rules": []},
        }
        with mock.patch.object(client, "_request", return_value=current) as req:
            client.ensure_hitl_tools(("searchfree_search",))
        path, method, payload = req.call_args.args
        self.assertEqual(path, "/api/admin/security")
        self.assertEqual(method, "PUT")
        self.assertEqual(payload["hitl"]["tools"], ["write_file", "searchfree_search"])
        self.assertTrue(payload["hitl"]["enabled"])
        self.assertEqual(payload["hitl"]["allowed_decisions"], ["approve", "reject"])
        self.assertEqual(payload["filesystem"], current["filesystem"])
        self.assertEqual(current["hitl"]["tools"], ["write_file"], "不得原地修改读到的策略")

    def test_ensure_hitl_tools_expands_default_before_merging(self):
        """`tools: "default"` 必须先展开，否则字符串会被丢弃、默认 5 件套失守。"""
        client = self._client()
        client._token = "jwt"
        with mock.patch.object(
            client, "_request",
            return_value={"hitl": {"enabled": True, "tools": "default"}},
        ) as req:
            client.ensure_hitl_tools(("searchfree_search",))
        payload = req.call_args.args[2]
        self.assertEqual(payload["hitl"]["tools"], [
            "bash", "execute", "write_file", "edit_file", "delete", "searchfree_search",
        ])


if __name__ == "__main__":
    unittest.main()
