"""P6.1 tests — sandbox simulation mode.

验收：模拟创建草稿不会出现在真实工作区，模拟发送不会产生网络请求。
- 隔离运行目录；写操作重定向到模拟目录。
- 外部工具替换为 fake tool。
- 输出 action diff、risk summary、expected evidence。
- 清晰标记 simulated，不生成真实完成证据。
"""

from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from personal.sandbox import SandboxRun, SandboxCall, SimulationResult


def task_contract(real_workspace: str) -> dict:
    return {
        "id": "task_1",
        "workspace": real_workspace,
        "goal": "整理报销材料并提醒",
        "policy_version": "baseline-0.1",
    }


class TestSandboxIsolation(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.real = Path(self.tmp.name) / "workspace"
        self.real.mkdir()

    def tearDown(self):
        self.tmp.cleanup()

    def test_draft_lands_in_simulated_dir_not_real_workspace(self):
        """模拟创建草稿不会出现在真实工作区。"""
        calls = [SandboxCall(
            tool="create_draft",
            parameters={"path": str(self.real / "draft.md"), "content": "草稿"},
        )]
        run = SandboxRun(task_contract(task_contract(str(self.real))), calls=calls)
        result = run.execute()
        # 真实工作区没有被写入
        self.assertFalse((self.real / "draft.md").exists())
        # 草稿落在模拟目录
        sim_draft = next(Path for Path in run.run_dir.rglob("draft.md"))
        self.assertTrue(sim_draft.exists())
        # 结果标记 simulated
        self.assertTrue(result.simulated)

    def test_writes_redirected_only_into_run_dir(self):
        calls = [
            SandboxCall(tool="create_draft",
                        parameters={"path": str(self.real / "a.md"), "content": "a"}),
            SandboxCall(tool="create_draft",
                        parameters={"path": str(self.real / "b.md"), "content": "b"}),
        ]
        run = SandboxRun(task_contract(task_contract(str(self.real))), calls=calls)
        run.execute()
        # 真实工作区里除了 run_dir 之外什么都没有
        leaked = [p for p in self.real.iterdir() if p.name != "simulation"]
        self.assertEqual(leaked, [])


class TestFakeExternalTool(unittest.TestCase):
    def test_simulated_send_produces_no_network(self):
        """模拟发送不会产生网络请求——send 是未注册工具，sandbox 只记录不触网。"""
        network_calls: list = []
        calls = [SandboxCall(
            tool="external_send",
            parameters={"to": "x@e.com", "content": "hi"},
            side_effect=network_calls.append,   # 如果产生网络，会调用 append
        )]
        run = SandboxRun(task_contract(task_contract("/tmp/x")), calls=calls)
        result = run.execute()
        self.assertEqual(network_calls, [], "模拟发送不得产生任何副作用")
        # send 被 fake 记录，标记 simulated
        action = result.actions[0]
        self.assertTrue(action.simulated)
        self.assertEqual(action.tool, "external_send")
        self.assertEqual(action.status, "simulated_no_effect")

    def test_registered_tool_still_uses_fake_executor_in_sim(self):
        """已注册的 create_draft 在 sandbox 里走 fake executor，写到模拟目录。"""
        calls = [SandboxCall(tool="create_draft",
                             parameters={"path": "/tmp/x/d.md", "content": "d"})]
        run = SandboxRun(task_contract(task_contract("/tmp/x")), calls=calls)
        result = run.execute()
        a = result.actions[0]
        self.assertTrue(a.simulated)
        self.assertEqual(a.status, "simulated_wrote")


class TestSimulationOutput(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.real = Path(self.tmp.name) / "ws"
        self.real.mkdir()
        self.calls = [
            SandboxCall(tool="create_draft",
                        parameters={"path": str(self.real / "draft.md"), "content": "草稿内容"}),
            SandboxCall(tool="external_send",
                        parameters={"to": "x@e.com", "content": "草稿内容"}),
            SandboxCall(tool="create_reminder",
                        parameters={"id": "r1", "title": "提醒", "due": "2026-10-10T09:00:00+08:00"}),
        ]
        self.run = SandboxRun(task_contract(task_contract(str(self.real))), calls=self.calls)
        self.result = self.run.execute()

    def tearDown(self):
        self.tmp.cleanup()

    def test_action_diff_present(self):
        d = self.result.to_dict()
        self.assertIn("action_diff", d)
        # create_draft 的 diff 包含写入的相对路径 + 内容
        draft_diff = next(d for d in d["action_diff"] if d["tool"] == "create_draft")
        self.assertIn("draft.md", draft_diff["path"])
        self.assertEqual(draft_diff["diff_type"], "create")

    def test_risk_summary_counts_high_risk(self):
        s = self.result.to_dict()["risk_summary"]
        self.assertEqual(s["total_actions"], 3)
        self.assertEqual(s["high_risk"], 1)        # external_send
        self.assertEqual(s["low_risk"], 2)

    def test_expected_evidence_listed_but_marked_simulated(self):
        ev = self.result.to_dict()["expected_evidence"]
        self.assertTrue(ev)
        for e in ev:
            self.assertTrue(e["simulated"], "模拟运行的证据必须标记 simulated")
            self.assertNotEqual(e["verification"], "verified")
            self.assertNotEqual(e["verification"], "done")

    def test_result_itself_is_simulated_not_done(self):
        self.assertTrue(self.result.simulated)
        self.assertNotEqual(self.result.overall_status, "done")


class TestRoundTripStable(unittest.TestCase):
    def test_same_inputs_same_run_dir_pattern(self):
        """可复现：同样 calls + contract → 相同 action diff（fake provider 决定性）。"""
        import hashlib, json as _json
        calls = [SandboxCall(tool="create_draft",
                             parameters={"path": "/tmp/x/d.md", "content": "x"})]
        contract = task_contract("/tmp/x")
        r1 = SandboxRun(contract, calls=calls).execute()
        r2 = SandboxRun(contract, calls=calls).execute()
        self.assertEqual(
            _json.dumps(r1.to_dict()["action_diff"], sort_keys=True, ensure_ascii=False),
            _json.dumps(r2.to_dict()["action_diff"], sort_keys=True, ensure_ascii=False),
        )


if __name__ == "__main__":
    unittest.main()
