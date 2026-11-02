"""PersonalRunner 单元测试 — 脚本化 client，验证门禁决策与回执验证。"""

from __future__ import annotations

import sys

import tempfile

import unittest

from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

NL = chr(10)
LS_RESULT = "doc_01.md" + NL + "doc_02.md" + NL + "doc_03.md"
LS_GHOST = "doc_01.md" + NL + "GHOST.md"

from personal.runner import PersonalRunner, rule_from_dict

from personal.protocols.octop import ToolReceipt

from personal.rules import EngineRule

class FakeClient:

    """记录 run_turn 参数，返回脚本化结果。"""

    def __init__(self, result: dict):

        self.result = result

        self.calls: list[dict] = []

        self._next_tid = 0

    def create_thread(self, agent_id: str) -> str:

        self._next_tid += 1

        return f"thr_{self._next_tid}"

    def run_turn(self, agent_id, thread_id, text, *, on_hitl=None, hitl_policy=None, timeout_s=None):

        self.calls.append({"agent_id": agent_id, "thread_id": thread_id, "text": text,

                           "hitl_policy": hitl_policy})

        if on_hitl is not None:

            for req in self.result.pop("_hitl_requests", []):

                decisions = on_hitl(req)

                self.result.setdefault("hitl_log", []).append({"request": req, "decisions": decisions})

        return self.result

def receipt(name: str, args: dict, result: str, event_id: str = "live:T:c1") -> dict:

    return {

        "event_id": event_id, "call_id": "c1", "tool_name": name,

        "args": args, "result": result, "is_error": False,

        "evidence": {"id": f"evidence_octop_{event_id}", "kind": "tool_result",

                     "locator": f"octop://trajectory/A1/T1/{event_id}"},

    }

class GateDecisionTest(unittest.TestCase):

    def setUp(self):

        self.tmp = tempfile.TemporaryDirectory()

        self.root = Path(self.tmp.name)

    def tearDown(self):

        self.tmp.cleanup()

    def _runner(self, scopes=("inbox/",)) -> PersonalRunner:

        return PersonalRunner(FakeClient({}), "A1", self.root, allowed_scopes=scopes)

    def test_draft_write_within_scope_auto_approved(self):

        r = self._runner()

        handler = r._make_gate([], None) and r._on_hitl(r._make_gate([], None), "t1", None)

        decisions = handler({"action_requests": [

            {"name": "write_file", "args": {"path": "/inbox/汇总.md", "content": "x"}}]})

        self.assertEqual(decisions, [{"type": "approve"}])

    def test_forbidden_kind_rejected_with_plain_message(self):

        r = self._runner()

        handler = r._on_hitl(r._make_gate([], None), "t1", None)

        decisions = handler({"action_requests": [

            {"name": "execute", "args": {"command": "rm -rf /"}}]})

        self.assertEqual(decisions[0]["type"], "reject")

        self.assertIn("范围", decisions[0]["message"])

    def test_web_fetch_is_network_gated_not_scope_checked(self):

        """web_fetch 是联网读取：无 network_policy 时按联网关闭拒绝。"""

        r = self._runner()

        handler = r._on_hitl(r._make_gate([], None), "t1", None)

        decisions = handler({"action_requests": [

            {"name": "web_fetch", "args": {"url": "https://example.com"}}]})

        self.assertEqual(decisions[0]["type"], "reject")

        self.assertIn("没有开启", decisions[0]["message"])

    def test_user_rule_deny_blocks_draft(self):

        r = self._runner()

        rule = rule_from_dict({"id": "r1", "when": {"event": "draft", "scope": "all"},

                               "then": {"action": "deny"}, "priority": 100})

        handler = r._on_hitl(r._make_gate([rule], None), "t1", None)

        decisions = handler({"action_requests": [

            {"name": "write_file", "args": {"path": "/inbox/a.md"}}]})

        self.assertEqual(decisions[0]["type"], "reject")

        self.assertIn("规则", decisions[0]["message"])

    def test_out_of_scope_path_rejected(self):

        r = self._runner(scopes=("inbox/",))

        handler = r._on_hitl(r._make_gate([], None), "t1", None)

        decisions = handler({"action_requests": [

            {"name": "write_file", "args": {"path": "/system/config.md"}}]})

        self.assertEqual(decisions[0]["type"], "reject")

        self.assertIn("范围", decisions[0]["message"])

    def test_multiple_requests_get_equal_count_decisions(self):

        r = self._runner()

        handler = r._on_hitl(r._make_gate([], None), "t1", None)

        decisions = handler({"action_requests": [

            {"name": "write_file", "args": {"path": "/inbox/a.md"}},

            {"name": "web_fetch", "args": {"url": "https://x"}},

        ]})

        self.assertEqual(len(decisions), 2)

        self.assertEqual([d["type"] for d in decisions], ["approve", "reject"])

    def test_non_integer_float_args_reject_instead_of_crashing_turn(self):

        """参数里有 9.9 这类无法 canonical 化的值时，必须 reject 该动作而不是抛异常。"""

        r = self._runner()

        handler = r._on_hitl(r._make_gate([], None), "t1", None)

        decisions = handler({"action_requests": [

            {"name": "write_file", "args": {"path": "/inbox/a.md", "size": 9.9}}]})

        self.assertEqual(decisions[0]["type"], "reject")

        self.assertIn("无法确认", decisions[0]["message"])

    def test_one_unhashable_action_does_not_block_the_next(self):

        """第一个动作参数坏掉时，后面的正常动作仍要照常审批。"""

        r = self._runner()

        handler = r._on_hitl(r._make_gate([], None), "t1", None)

        decisions = handler({"action_requests": [

            {"name": "write_file", "args": {"path": "/inbox/a.md", "size": 9.9}},

            {"name": "write_file", "args": {"path": "/inbox/b.md", "content": "x"}},

        ]})

        self.assertEqual([d["type"] for d in decisions], ["reject", "approve"])

    def test_octop_file_path_key_is_understood_by_scope_check(self):

        """实机 HITL args 用 file_path 键 + 前导 /；scope 检查必须识别。"""

        r = self._runner(scopes=("inbox/",))

        handler = r._on_hitl(r._make_gate([], None), "t1", None)

        decisions = handler({"action_requests": [

            {"name": "write_file", "args": {"file_path": "/inbox/材料汇总.md", "content": "x"}}]})

        self.assertEqual(decisions, [{"type": "approve"}])

        decisions = handler({"action_requests": [

            {"name": "write_file", "args": {"file_path": "/system/x.md", "content": "x"}}]})

        self.assertEqual(decisions[0]["type"], "reject")

class RunReportTest(unittest.TestCase):

    def setUp(self):

        self.tmp = tempfile.TemporaryDirectory()

        self.root = Path(self.tmp.name)

        (self.root / "inbox").mkdir()

        (self.root / "inbox" / "汇总.md").write_text("# 汇总", encoding="utf-8")

    def tearDown(self):

        self.tmp.cleanup()

    def test_write_receipt_verified_against_local_disk(self):

        client = FakeClient({

            "status": "done", "error": None, "final_text": "完成",

            "receipts": [receipt("write_file", {"path": "/inbox/汇总.md", "file_path": "/inbox/汇总.md"},

                                 "Updated file /inbox/汇总.md")],

            "hitl_log": [],

        })

        report = PersonalRunner(client, "A1", self.root).run(

            "t1", "整理", [], None, thread_id="T1")

        self.assertEqual(report.status, "done")

        self.assertEqual(report.overall_verification, "verified")

        self.assertEqual(report.verifications[0]["status"], "verified")

    def test_timeout_turn_is_unverifiable_even_with_green_receipts(self):

        """C1 回归：超时 turn 写了一个文件 → 回执全绿也不能声称 verified。"""

        client = FakeClient({

            "status": "timeout", "error": None, "final_text": "",

            "receipts": [receipt("write_file", {"path": "/inbox/汇总.md"},

                                 "Updated file /inbox/汇总.md")],

            "hitl_log": [],

        })

        report = PersonalRunner(client, "A1", self.root).run(

            "t1", "整理", [], None, thread_id="T1")

        self.assertEqual(report.status, "timeout")

        self.assertEqual(report.verifications[0]["status"], "verified")

        self.assertEqual(report.overall_verification, "unverifiable")

    def test_error_turn_is_unverifiable_even_with_green_receipts(self):

        client = FakeClient({

            "status": "error", "error": "ws closed", "final_text": "",

            "receipts": [receipt("write_file", {"path": "/inbox/汇总.md"},

                                 "Updated file /inbox/汇总.md")],

            "hitl_log": [],

        })

        report = PersonalRunner(client, "A1", self.root).run(

            "t1", "整理", [], None, thread_id="T1")

        self.assertEqual(report.overall_verification, "unverifiable")

    def test_full_turn_with_float_args_returns_reject_not_exception(self):

        """整轮回归：C2 的 500 来自 issue_confirmation 抛 TypeError 冒到 turn。

        带 9.9 的 write_file 必须走完 run() 并留下 reject 决策。"""

        client = FakeClient({

            "status": "done", "error": None, "final_text": "完成",

            "receipts": [], "hitl_log": [],

            "_hitl_requests": [{"action_requests": [

                {"name": "write_file", "args": {"path": "/inbox/a.md", "size": 9.9}}]}],

        })

        report = PersonalRunner(client, "A1", self.root).run(

            "t1", "整理", [], None, thread_id="T1")

        self.assertEqual(report.status, "done")

        decisions = report.hitl_log[0]["decisions"]

        self.assertEqual(decisions[0]["type"], "reject")

        self.assertIn("无法确认", decisions[0]["message"])

    def test_receipts_without_args_are_unverifiable_not_done(self):

        """args 解析失败（流片段残缺）→ 无法定位文件 → 明确 unverifiable，绝不假 verified。"""

        client = FakeClient({

            "status": "done", "error": None, "final_text": "完成",

            "receipts": [receipt("write_file", {"_unparsed_args": "{"}, "Updated")],

            "hitl_log": [],

        })

        report = PersonalRunner(client, "A1", self.root).run(

            "t1", "整理", [], None, thread_id="T1")

        self.assertEqual(report.overall_verification, "executed_unverified")

        self.assertEqual(report.verifications[0]["status"], "unverifiable")

    def test_missing_file_maps_to_unverifiable_not_done(self):

        """回执说写了，磁盘上没有 → 不可验证，绝不 verified（红线）。"""

        client = FakeClient({

            "status": "done", "error": None, "final_text": "完成",

            "receipts": [receipt("write_file", {"path": "/inbox/不存在.md"}, "Updated")],

            "hitl_log": [],

        })

        report = PersonalRunner(client, "A1", self.root).run(

            "t1", "整理", [], None, thread_id="T1")

        self.assertEqual(report.overall_verification, "executed_unverified")

        self.assertEqual(report.verifications[0]["status"], "unverifiable")

    def test_read_receipt_verified_when_file_exists(self):

        client = FakeClient({

            "status": "done", "error": None, "final_text": "",

            "receipts": [receipt("read_file", {"path": "/inbox/汇总.md"}, "1 # 汇总",

                                 event_id="live:T:c2")],

            "hitl_log": [],

        })

        report = PersonalRunner(client, "A1", self.root).run(

            "t1", "整理", [], None, thread_id="T1")

        self.assertEqual(report.overall_verification, "verified")

    def test_hitl_policy_only_allows_read_tools(self):

        client = FakeClient({"status": "done", "error": None, "final_text": "",

                             "receipts": [], "hitl_log": []})

        PersonalRunner(client, "A1", self.root).run("t1", "整理", [], None, thread_id="T1")

        self.assertEqual(client.calls[0]["hitl_policy"],

                         {"mode": "allow_tools", "tools": ["ls", "read_file", "glob", "grep"]})

    def test_search_tools_never_enter_allow_list(self):

        """搜索必须触发 HITL，否则 query 无法在出网前过 network_policy。"""

        client = FakeClient({"status": "done", "error": None, "final_text": "",

                             "receipts": [], "hitl_log": []})

        policy = {"enabled": True, "mode": "allow", "providers": ["searchfree"],

                  "allowed_domains": [], "query_data_class": "public_only",

                  "max_results": 5, "recency": None}

        PersonalRunner(client, "A1", self.root).run(

            "t1", "查资料", [], None, thread_id="T1", network_policy=policy)

        self.assertEqual(client.calls[0]["hitl_policy"]["tools"],

                         ["ls", "read_file", "glob", "grep"])

class SearchGateTest(unittest.TestCase):

    def setUp(self):

        self.tmp = tempfile.TemporaryDirectory()

        self.root = Path(self.tmp.name)

    def tearDown(self):

        self.tmp.cleanup()

    def _handler(self, policy):

        r = PersonalRunner(FakeClient({}), "A1", self.root)

        return r._on_hitl(r._make_gate([], None), "t1", None, policy)

    def test_public_search_allowed_when_policy_enables(self):

        policy = {"enabled": True, "mode": "allow", "providers": ["searchfree"],

                  "allowed_domains": [], "query_data_class": "public_only",

                  "max_results": 5, "recency": None}

        d = self._handler(policy)({"action_requests": [

            {"name": "searchfree_search", "args": {"query": "Python 3.12 新特性"}}]})

        self.assertEqual(d, [{"type": "approve"}])

    def test_search_denied_when_network_disabled(self):

        policy = {"enabled": False, "mode": "deny", "providers": ["searchfree"],

                  "allowed_domains": [], "query_data_class": "public_only",

                  "max_results": 5, "recency": None}

        d = self._handler(policy)({"action_requests": [

            {"name": "searchfree_search", "args": {"query": "公开问题"}}]})

        self.assertEqual(d[0]["type"], "reject")

        self.assertIn("没有开启", d[0]["message"])

    def test_search_denied_when_query_contains_local_path(self):

        policy = {"enabled": True, "mode": "allow", "providers": ["searchfree"],

                  "allowed_domains": [], "query_data_class": "public_only",

                  "max_results": 5, "recency": None}

        d = self._handler(policy)({"action_requests": [

            {"name": "searchfree_search", "args": {"query": "查 D:\\资料\\报销单.md"}}]})

        self.assertEqual(d[0]["type"], "reject")

        self.assertIn("隐私", d[0]["message"])

    def test_search_denied_for_unapproved_provider(self):

        policy = {"enabled": True, "mode": "allow", "providers": ["searchfree"],

                  "allowed_domains": [], "query_data_class": "public_only",

                  "max_results": 5, "recency": None}

        d = self._handler(policy)({"action_requests": [

            {"name": "tavily_search", "args": {"query": "公开问题"}}]})

        self.assertEqual(d[0]["type"], "reject")

    def test_missing_policy_denies_search_by_default(self):

        d = self._handler(None)({"action_requests": [

            {"name": "searchfree_search", "args": {"query": "公开问题"}}]})

        self.assertEqual(d[0]["type"], "reject")

    def test_search_decision_logged_without_raw_query(self):

        """trace 只留 hash + 脱敏 query；原文绝不落库。"""

        policy = {"enabled": True, "mode": "allow", "providers": ["searchfree"],

                  "allowed_domains": [], "query_data_class": "public_only",

                  "max_results": 5, "recency": None}

        log: list[dict] = []

        r = PersonalRunner(FakeClient({}), "A1", self.root)

        handler = r._on_hitl(r._make_gate([], None), "t1", None, policy, log)

        handler({"action_requests": [

            {"name": "searchfree_search", "args": {"query": "D:\\私密\\身份证.txt 内容"}}]})

        self.assertEqual(len(log), 1)

        self.assertEqual(log[0]["verdict"], "deny")

        self.assertTrue(log[0]["query_hash"].startswith("sha256:"))

        self.assertNotIn("私密", log[0]["query_redacted"])

class SearchReceiptIntegrationTest(unittest.TestCase):

    def setUp(self):

        self.tmp = tempfile.TemporaryDirectory()

        self.root = Path(self.tmp.name)

        (self.root / "inbox").mkdir()

    def tearDown(self):

        self.tmp.cleanup()

    def _policy(self, **kw):

        base = {"enabled": True, "mode": "allow", "providers": ["searchfree"],

                "allowed_domains": [], "query_data_class": "public_only",

                "max_results": 5, "recency": None}

        base.update(kw)

        return base

    def test_search_receipt_carries_source_urls(self):

        client = FakeClient({

            "status": "done", "error": None, "final_text": "答案",

            "receipts": [{

                "event_id": "live:T:s1", "call_id": "s1", "tool_name": "searchfree_search",

                "args": {"query": "公开问题"}, "is_error": False,

                "result": {"results": [

                    {"url": "https://example.com/a", "title": "A", "content": "摘要"}]},

                "evidence": {"id": "evidence_octop_live:T:s1", "kind": "tool_result",

                             "locator": "octop://x", "content_hash": "sha256:x"},

            }],

            "hitl_log": [],

        })

        report = PersonalRunner(client, "A1", self.root).run(

            "t1", "查", [], None, thread_id="T1", network_policy=self._policy())

        self.assertEqual(len(report.search_receipts), 1)

        self.assertEqual(report.search_receipts[0]["results"][0]["url"], "https://example.com/a")

        self.assertIn("evidence", report.search_receipts[0])

    def test_search_without_sources_cannot_be_verified(self):

        """搜索发生了但没有来源 URL → executed_unverified，绝不 verified。"""

        (self.root / "inbox" / "汇总.md").write_text("# 汇总", encoding="utf-8")

        client = FakeClient({

            "status": "done", "error": None, "final_text": "",

            "receipts": [

                receipt("write_file", {"path": "/inbox/汇总.md"}, "Updated"),

                {"event_id": "live:T:s1", "call_id": "s1", "tool_name": "searchfree_search",

                 "args": {"query": "公开问题"}, "is_error": False,

                 "result": {"results": []}, "evidence": {"id": "e", "kind": "tool_result"}},

            ],

            "hitl_log": [],

        })

        report = PersonalRunner(client, "A1", self.root).run(

            "t1", "查", [], None, thread_id="T1", network_policy=self._policy())

        self.assertEqual(report.overall_verification, "executed_unverified")

class ListingVerifierTest(unittest.TestCase):

    """ls / glob / grep 的本地验证器。

    背景：Occamy 这类高效模型常常只调一次 ls 就完成任务，不会去 read_file。

    若不给列举类工具验证器，verifications 为空 → 任务被标成 unverifiable，

    一个完全正确的结果反而显示"无法确认"。

    """

    def setUp(self):

        self.tmp = tempfile.TemporaryDirectory()

        self.root = Path(self.tmp.name)

        (self.root / "inbox").mkdir()

        for i in range(1, 4):

            (self.root / "inbox" / f"doc_{i:02d}.md").write_text(f"# {i}", encoding="utf-8")

    def tearDown(self):

        self.tmp.cleanup()

    def _runner(self):

        return PersonalRunner(FakeClient({}), "A1", self.root)

    def _receipt(self, tool, result, path="/inbox"):

        return ToolReceipt(

            protocol_version="1.0.0", event_id="e1", thread_id="", agent_id="",

            seq=0, ts=0.0, turn_id=None, request_seq=None, is_error=False, summary="",

            call_id="c1", tool_name=tool, args={"path": path}, result=result, raw_payload={},

        )

    def test_ls_with_real_entries_is_verified(self):

        r = self._runner()._verify_receipt(

            self._receipt("ls", LS_RESULT))

        self.assertIsNotNone(r)

        self.assertEqual(r.status, "verified", r.reason)

    def test_ls_on_missing_dir_is_unverifiable(self):

        r = self._runner()._verify_receipt(

            self._receipt("ls", "a.md", path="/nowhere"))

        self.assertEqual(r.status, "unverifiable")

    def test_ls_with_phantom_entry_fails(self):

        """列举里有磁盘上不存在的条目 → failed，绝不 verified。"""

        r = self._runner()._verify_receipt(

            self._receipt("ls", LS_GHOST))

        self.assertEqual(r.status, "failed")

        self.assertIn("GHOST.md", r.checks[-1]["missing"])

    def test_ls_with_no_parseable_entries_is_executed_unverified(self):

        r = self._runner()._verify_receipt(self._receipt("ls", ""))

        self.assertEqual(r.status, "executed_unverified")

    def test_ls_python_repr_list_with_workspace_prefix(self):
        """实机形态：Occamy 的 ls 返回 Python repr 的列表，条目带 /inbox 前缀。"""
        r = self._runner()._verify_receipt(self._receipt(
            "ls",
            "['/inbox/doc_01.md', '/inbox/doc_02.md', '/inbox/doc_03.md']",
        ))
        self.assertIsNotNone(r)
        self.assertEqual(r.status, "verified", r.reason)

    def test_ls_json_list_with_workspace_prefix(self):
        """JSON 数组形态也应支持。"""
        r = self._runner()._verify_receipt(self._receipt(
            "ls", '["/inbox/doc_01.md", "/inbox/doc_02.md"]'))
        self.assertEqual(r.status, "verified", r.reason)

    def test_ls_receipt_makes_overall_verified(self):

        """端到端：只有 ls 回执时，overall 也应能到 verified。"""

        def receipt_of(tool, args, result, eid):

            return {

                "event_id": eid, "call_id": "c1", "tool_name": tool,

                "args": args, "result": result, "is_error": False,

                "evidence": {"id": f"evidence_octop_{eid}", "kind": "tool_result",

                             "locator": f"octop://x/{eid}"},

            }

        client = FakeClient({

            "status": "done", "error": None, "final_text": "10 个文件",

            "receipts": [receipt_of("ls", {"path": "/inbox"},

                                    LS_RESULT, "live:T:c1")],

            "hitl_log": [],

        })

        report = PersonalRunner(client, "A1", self.root).run(

            "t1", "列出文件", [], None, thread_id="T1")

        self.assertEqual(report.overall_verification, "verified")

if __name__ == "__main__":

    unittest.main()
