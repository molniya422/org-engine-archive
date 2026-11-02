"""service 冒烟测试 — 起在临时端口上，真实 HTTP 往返。"""

from __future__ import annotations

import json
import sys
import threading
import unittest
import urllib.request
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from personal.service import serve

TASK = {
    "contract_version": 1, "policy_version": "baseline-0.1", "trace_id": "tr1",
    "task_id": "t1", "intent_id": "i1", "conversation_id": "c1",
    "goal": "整理材料", "redacted_state": {}, "evidence_refs": [],
    "budget": {}, "allowed_scopes": ["workspace/"], "forbidden_actions": ["external_send"],
}


class ServiceSmokeTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = serve(port=0)  # 临时端口
        cls.port = cls.server.server_address[1]
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()

    def _post(self, path: str, body: dict) -> tuple[int, dict]:
        req = urllib.request.Request(
            f"http://127.0.0.1:{self.port}{path}",
            data=json.dumps(body).encode(), headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=10) as r:
                return r.status, json.loads(r.read().decode())
        except urllib.error.HTTPError as e:
            return e.code, json.loads(e.read().decode())

    def test_health(self):
        with urllib.request.urlopen(f"http://127.0.0.1:{self.port}/health") as r:
            self.assertEqual(json.loads(r.read())["ok"], True)

    def test_plan_selects_low_risk_draft(self):
        code, out = self._post("/v1/plan", {"task": TASK, "rules": []})
        self.assertEqual(code, 200)
        plan = out["plan"]
        self.assertEqual(plan["verdict"], "select")
        self.assertEqual(plan["selected_action"], "t1_a0")
        self.assertFalse(plan["requires_confirmation"])
        self.assertEqual(plan["trace_id"], "tr1")

    def test_plan_blocked_by_forbidden_kind(self):
        task = {**TASK, "forbidden_actions": ["draft"]}
        code, out = self._post("/v1/plan", {"task": task, "rules": []})
        self.assertEqual(code, 200)
        self.assertEqual(out["plan"]["verdict"], "blocked")

    def test_plan_requires_confirmation_when_contract_declares_confirmation_points(self):
        """合同声明了确认点 → 计划必须停在 needs_confirmation，不能直接执行。"""
        task = {**TASK, "confirmation_points": [
            {"action_kind": "draft", "description": "开始执行前先问我"},
        ]}
        code, out = self._post("/v1/plan", {"task": task, "rules": []})
        self.assertEqual(code, 200)
        plan = out["plan"]
        self.assertEqual(plan["verdict"], "needs_confirmation")
        self.assertTrue(plan["requires_confirmation"])
        self.assertEqual(plan["selected_action"], "t1_a0")

    def test_confirmation_points_never_override_blocked(self):
        """被规则禁止的计划不能靠确认点变成可确认——禁止优先。"""
        task = {**TASK, "forbidden_actions": ["draft"],
                "confirmation_points": [{"action_kind": "draft"}]}
        code, out = self._post("/v1/plan", {"task": task, "rules": []})
        self.assertEqual(code, 200)
        self.assertEqual(out["plan"]["verdict"], "blocked")

    def test_verify_checks_local_disk(self):
        import tempfile
        with tempfile.TemporaryDirectory() as tmp:
            Path(tmp, "汇总.md").write_text("# 汇总", encoding="utf-8")
            code, out = self._post("/v1/verify", {
                "workspace_root": tmp,
                "receipts": [{"event_id": "e1", "tool_name": "write_file",
                              "args": {"path": "汇总.md"}, "result": "ok"}],
            })
            self.assertEqual(code, 200)
            self.assertEqual(out["verification"]["overall"], "verified")
            code, out = self._post("/v1/verify", {
                "workspace_root": tmp,
                "receipts": [{"event_id": "e2", "tool_name": "write_file",
                              "args": {"path": "不存在.md"}, "result": "ok"}],
            })
            self.assertEqual(out["verification"]["overall"], "executed_unverified")

    def test_missing_field_is_400(self):
        code, out = self._post("/v1/plan", {"rules": []})
        self.assertEqual(code, 400)
        self.assertIn("task", out["error"])

    def test_verify_unparsable_args_is_unverifiable(self):
        """回执 args 残缺（流截断）→ 定位不到文件 → unverifiable，绝不假 verified。"""
        import tempfile
        with tempfile.TemporaryDirectory() as tmp:
            code, out = self._post("/v1/verify", {
                "workspace_root": tmp,
                "receipts": [{"event_id": "e3", "tool_name": "write_file",
                              "args": {"_unparsed_args": "{"}, "result": "ok"}],
            })
            self.assertEqual(out["verification"]["overall"], "executed_unverified")

    def test_verify_octop_file_path_key_maps_to_disk(self):
        """实机 HITL 回执 args 用 file_path（前导 /）——验证要落到工作区相对路径。"""
        import tempfile
        with tempfile.TemporaryDirectory() as tmp:
            Path(tmp, "材料汇总.md").write_text("# 汇总", encoding="utf-8")
            code, out = self._post("/v1/verify", {
                "workspace_root": tmp,
                "receipts": [{"event_id": "e4", "tool_name": "write_file",
                              "args": {"file_path": "/材料汇总.md"}, "result": "ok"}],
            })
            self.assertEqual(out["verification"]["overall"], "verified")

    def test_verify_with_no_verifiable_receipts_is_unverifiable(self):
        """空回执集没有可核对的事实 → unverifiable，而不是 executed_unverified。"""
        import tempfile
        with tempfile.TemporaryDirectory() as tmp:
            code, out = self._post("/v1/verify", {"workspace_root": tmp, "receipts": []})
            self.assertEqual(code, 200)
            self.assertEqual(out["verification"]["overall"], "unverifiable")
            self.assertEqual(out["verification"]["results"], [])

    def test_plan_carries_network_policy_default_deny(self):
        code, out = self._post("/v1/plan", {"task": TASK, "rules": []})
        self.assertEqual(code, 200)
        policy = out["plan"]["network_policy"]
        self.assertFalse(policy["enabled"])
        self.assertEqual(policy["mode"], "deny")

    def test_execute_rejects_contract_version_mismatch(self):
        """旧计划不能驱动新合同：版本不一致 → 400，绝不执行。"""
        body = {
            "plan": {
                "trace_id": "tr1", "task_id": "t1", "contract_version": 1,
                "policy_version": "baseline-0.1", "candidates": [
                    {"id": "t1_a0", "kind": "draft", "risk_level": "medium",
                     "parameters": {"instruction": "x"}},
                ],
                "verdict": "select", "selected_action": "t1_a0", "reason": "",
                "missing_information": [], "rule_refs": [], "requires_confirmation": False,
            },
            "contract_version": 2,
            "rules": [],
            "octop": {"base_url": "http://127.0.0.1:8088", "username": "u",
                      "password": "p", "workspace_root": "/tmp", "agent_id": "A1"},
        }
        code, out = self._post("/v1/execute", body)
        self.assertEqual(code, 400)
        self.assertEqual(out["error"], "contract_version_mismatch")

    def _search_execute_body(self, enabled: bool) -> dict:
        """启用联网的计划；run_turn 打桩，只为观察预检是否发生在执行之前。"""
        plan = {
            "trace_id": "tr1", "task_id": "t1", "contract_version": 1,
            "policy_version": "baseline-0.1", "candidates": [
                {"id": "t1_a0", "kind": "draft", "risk_level": "medium",
                 "parameters": {"instruction": "查点公开资料"}},
            ],
            "verdict": "select", "selected_action": "t1_a0", "reason": "",
            "missing_information": [], "rule_refs": [], "requires_confirmation": False,
            "network_policy": {
                "enabled": enabled, "mode": "allow", "providers": ["searchfree"],
                "allowed_domains": [], "query_data_class": "public_only",
                "max_results": 5, "recency": None,
            },
        }
        return {
            "plan": plan, "contract_version": 1, "rules": [],
            "octop": {"base_url": "http://127.0.0.1:8088", "username": "u",
                      "password": "p", "workspace_root": "/tmp", "agent_id": "A1"},
        }

    def test_execute_blocks_when_search_tool_is_not_gated(self):
        """搜索工具没被 HITL 拦住 → OctopPreflightError，且 turn 根本不该开始。"""
        from personal.adapters.octop_http import AgentPreflight, OctopPreflightError
        from personal.service import execute

        report = AgentPreflight(
            ok=False, agent_id="A1", missing_tools=[], tools_outside_hitl=["tavily_search"],
            detail="工具未纳入 HITL: ['tavily_search']",
        )
        body = self._search_execute_body(enabled=True)
        with mock.patch("personal.service.OctopHttpClient") as client_cls:
            client = client_cls.return_value
            client.agent_preflight.return_value = report
            with self.assertRaises(OctopPreflightError):
                execute(body["plan"], body)
        client.agent_preflight.assert_called_once_with(
            "A1", required_tools=(), gate_all_search_tools=True)
        client.run_turn.assert_not_called()

    def test_execute_returns_503_when_preflight_fails(self):
        """HTTP 层：预检失败是可恢复的部署问题（503 octop_not_ready），不是 500。"""
        from personal.adapters.octop_http import AgentPreflight

        report = AgentPreflight(
            ok=False, agent_id="A1", tools_outside_hitl=["searchfree_search"],
            detail="工具未纳入 HITL: ['searchfree_search']",
        )
        body = self._search_execute_body(enabled=True)
        with mock.patch("personal.service.OctopHttpClient") as client_cls:
            client_cls.return_value.agent_preflight.return_value = report
            code, out = self._post("/v1/execute", body)
        self.assertEqual(code, 503)
        self.assertEqual(out["error"], "octop_not_ready")
        self.assertTrue(out["recoverable"])

    def test_execute_preflights_even_when_network_disabled(self):
        """网络关闭也要预检：agent 上挂着的搜索工具照样能被模型调用。"""
        from personal.adapters.octop_http import AgentPreflight
        from personal.service import execute

        report = AgentPreflight(
            ok=False, agent_id="A1", tools_outside_hitl=["tavily_search"],
            detail="工具未纳入 HITL: ['tavily_search']",
        )
        body = self._search_execute_body(enabled=False)
        with mock.patch("personal.service.OctopHttpClient") as client_cls:
            client = client_cls.return_value
            client.agent_preflight.return_value = report
            with self.assertRaises(Exception) as ctx:
                execute(body["plan"], body)
        self.assertEqual(type(ctx.exception).__name__, "OctopPreflightError")
        client.agent_preflight.assert_called_once_with(
            "A1", required_tools=(), gate_all_search_tools=True)
        client.run_turn.assert_not_called()

    def test_execute_proceeds_when_no_search_tools_mounted(self):
        """agent 上没有搜索工具 → 预检通过，任务正常进入执行。"""
        from personal.adapters.octop_http import AgentPreflight
        from personal.service import execute

        body = self._search_execute_body(enabled=False)
        with mock.patch("personal.service.OctopHttpClient") as client_cls:
            client = client_cls.return_value
            client.agent_preflight.return_value = AgentPreflight(ok=True, agent_id="A1")
            with mock.patch("personal.service.PersonalRunner") as runner_cls:
                runner_cls.return_value.run.return_value = mock.Mock(
                    status="error", error="stub", final_text="", overall_verification="unverifiable",
                    events=[], receipts=[], verifications=[], hitl_log=[],
                    search_decisions=[], search_receipts=[],
                )
                execute(body["plan"], body)
        runner_cls.return_value.run.assert_called_once()

    def test_execute_closes_bypass_for_unconfigured_mounted_search_tool(self):
        """端到端（真 client + 假 Octop HTTP）复现并关闭原始漏洞：

        plan 只允许 searchfree，但 agent 上还挂着 tavily_search 且它不在 HITL 清单里。
        旧实现只检查 `required_tools=("searchfree_search",)` → tavily 可被模型直接调用。
        现在必须拒绝执行。
        """
        from personal.adapters.octop_http import OctopHttpClient
        from personal.service import execute

        client = OctopHttpClient("http://127.0.0.1:8088", "u", "p", timeout_s=1)
        client._token = "jwt"
        routes = {
            "/api/agents/A1/tool-settings": {"tools": [
                {"name": "searchfree_search", "enabled": True, "available": True},
                {"name": "tavily_search", "enabled": True, "available": True},
                {"name": "write_file", "enabled": True, "available": True},
            ]},
            "/api/admin/security": {"hitl": {
                "enabled": True, "tools": ["write_file", "searchfree_search"],
            }},
        }
        body = self._search_execute_body(enabled=True)
        self.assertEqual(body["plan"]["network_policy"]["providers"], ["searchfree"])
        with mock.patch.object(client, "_request",
                               side_effect=lambda path, *a, **k: routes[path]):
            with mock.patch("personal.service.OctopHttpClient", return_value=client):
                with mock.patch("personal.service.PersonalRunner") as runner_cls:
                    runner_cls.return_value.run.return_value = mock.Mock(
                        status="done", error=None, final_text="", overall_verification="unverifiable",
                        events=[], receipts=[], verifications=[], hitl_log=[],
                        search_decisions=[], search_receipts=[],
                    )
                    with self.assertRaises(Exception) as ctx:
                        execute(body["plan"], body)
                    self.assertFalse(runner_cls.return_value.run.called, "预检失败前不得启动 turn")
        self.assertEqual(type(ctx.exception).__name__, "OctopPreflightError")
        self.assertIn("tavily_search", str(ctx.exception))


class ServiceDomainEndpointsTest(unittest.TestCase):
    """Task 5：把 eval / replay / simulate 三个能力包暴露给 TS 侧。"""

    @classmethod
    def setUpClass(cls):
        cls.server = serve(port=0)
        cls.port = cls.server.server_address[1]
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()

    def _post(self, path, body):
        req = urllib.request.Request(
            f"http://127.0.0.1:{self.port}{path}",
            data=json.dumps(body).encode(), headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=10) as r:
                return r.status, json.loads(r.read().decode())
        except urllib.error.HTTPError as e:
            return e.code, json.loads(e.read().decode())

    def test_eval_blocks_auto_send(self):
        code, out = self._post("/v1/eval", {
            "cases": [{
                "id": "no_send", "input": {},
                "expected_behavior": {"must_not_do": ["external_send"]},
            }],
            "outcomes": [{"case_id": "no_send", "actions": [{"kind": "external_send"}]}],
        })
        self.assertEqual(code, 200)
        self.assertFalse(out["report"]["ready"])

    def test_eval_passes_clean_run(self):
        code, out = self._post("/v1/eval", {
            "cases": [{
                "id": "ok", "input": {},
                "expected_behavior": {"must_not_do": ["external_send"]},
            }],
            "outcomes": [{"case_id": "ok", "actions": [{"kind": "create_draft"}]}],
        })
        self.assertEqual(code, 200)
        self.assertTrue(out["report"]["ready"])

    def test_eval_empty_set_is_not_ready(self):
        """空回归集没有覆盖度 → 不能标 ready（红线）。"""
        code, out = self._post("/v1/eval", {"cases": [], "outcomes": []})
        self.assertEqual(code, 200)
        self.assertFalse(out["report"]["ready"])
        self.assertIn("empty", out["report"]["reason"])

    def test_replay_returns_events_from_step(self):
        code, out = self._post("/v1/replay", {
            "record": {
                "trace_id": "tr1", "input_envelope": {"contract_version": 1},
                "state_snapshot": {"step": 0}, "model_version": "m1",
                "policy_version": "baseline-0.1", "tool_receipts": [],
                "nodes": [
                    {"step": 0, "event": "action_selected", "detail": {"action": "a0"}},
                    {"step": 1, "event": "action_completed", "detail": {}},
                ],
            },
            "from_step": 1,
        })
        self.assertEqual(code, 200)
        steps = [e["step"] for e in out["events"]]
        self.assertIn(1, steps)

    def test_replay_compare_reports_action_diff(self):
        base = {
            "trace_id": "tr1", "input_envelope": {"contract_version": 1},
            "state_snapshot": {}, "model_version": "m1",
            "policy_version": "baseline-0.1", "tool_receipts": [],
            "nodes": [{"step": 0, "event": "action_selected", "detail": {"action": "a0"}}],
        }
        changed = json.loads(json.dumps(base))
        changed["nodes"][0]["detail"]["action"] = "a1"
        code, out = self._post("/v1/replay/compare", {"old": base, "new": changed})
        self.assertEqual(code, 200)
        self.assertEqual(len(out["diff"]["action_diffs"]), 1)

    def test_simulate_never_reports_real_completion(self):
        code, out = self._post("/v1/simulate", {
            "contract": {"id": "task_1", "contract_version": 1},
            "calls": [{"tool": "create_draft",
                       "parameters": {"path": "workspace/a.md", "content": "x"}}],
        })
        self.assertEqual(code, 200)
        sim = out["simulation"]
        self.assertTrue(sim["simulated"])
        self.assertEqual(sim["status"], "simulated")
        self.assertNotEqual(sim.get("status"), "verified")


if __name__ == "__main__":
    unittest.main()
