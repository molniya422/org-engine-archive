"""P6.2 tests — replay records.

验收：同一 replay 在 fake provider 下输出稳定；高风险动作全部被模拟。
- 保存输入 envelope、状态快照、模型版本、policy 版本和 tool receipts。
- 支持从任一决策前节点重放。
- deterministic fake provider。
- 对比旧版本和新版本的动作、询问和证据。
- 不在回放中调用真实高风险工具。
"""

from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from personal.replay import (
    ReplayRecord,
    ReplayNode,
    replay_from,
    compare_replays,
    DeterministicFakeProvider,
)


def sample_record() -> ReplayRecord:
    return ReplayRecord(
        trace_id="trace_1",
        input_envelope={"contract_version": 1, "task_id": "task_1", "goal": "整理报销"},
        state_snapshot={"facts": [{"kind": "preference", "value": "月底前"}]},
        model_version="fake-1.0",
        policy_version="baseline-0.1",
        tool_receipts=[{"tool": "create_draft", "ok": True}],
        nodes=[
            ReplayNode(step=0, event="intent_understood", detail={"task_type": "materials"}),
            ReplayNode(step=1, event="action_selected", detail={"action": "a1"}),
        ],
    )


class TestReplayRecord(unittest.TestCase):
    def test_roundtrip_preserves_all_fields(self):
        r = sample_record()
        restored = ReplayRecord.from_dict(json.loads(json.dumps(r.to_dict())))
        self.assertEqual(restored, r)

    def test_serialized_contains_versions_and_receipts(self):
        d = sample_record().to_dict()
        self.assertEqual(d["model_version"], "fake-1.0")
        self.assertEqual(d["policy_version"], "baseline-0.1")
        self.assertTrue(d["tool_receipts"])


class TestReplayFromNode(unittest.TestCase):
    def test_replay_from_any_node(self):
        """从任一决策前节点重放——提供该节点之前的状态快照。"""
        record = sample_record()
        node = record.nodes[1]   # 从 action_selected 之前重放
        events = replay_from(record, from_step=node.step)
        self.assertEqual(events[0]["event"], "state_snapshot")
        self.assertEqual(events[1]["detail"]["action"], "a1")
        # 从 step 0 之前的重放：state_snapshot + 2 nodes = 3
        all_events = replay_from(record, from_step=0)
        self.assertEqual(len(all_events), 3)


class TestDeterministicProvider(unittest.TestCase):
    def test_same_input_same_output(self):
        """deterministic fake provider：同输入 → 同输出。"""
        p1 = DeterministicFakeProvider(seed="seed_a")
        p2 = DeterministicFakeProvider(seed="seed_a")
        out1 = p1.generate({"prompt": "整理"})
        out2 = p2.generate({"prompt": "整理"})
        self.assertEqual(out1, out2)

    def test_different_seed_different_output(self):
        p1 = DeterministicFakeProvider(seed="seed_a")
        p2 = DeterministicFakeProvider(seed="seed_b")
        self.assertNotEqual(
            p1.generate({"prompt": "整理"}), p2.generate({"prompt": "整理"}))

    def test_high_risk_actions_always_mocked(self):
        """回放绝不调用真实高风险工具——fake provider 的 receipts 只记录。"""
        calls = [{"tool": "external_send", "parameters": {"to": "x@e.com"}}]
        p = DeterministicFakeProvider(seed="s")
        receipts = p.mock_tool_calls(calls)
        self.assertEqual(len(receipts), 1)
        self.assertTrue(receipts[0]["mocked"])
        self.assertEqual(receipts[0]["status"], "simulated_no_effect")


class TestCompareReplays(unittest.TestCase):
    def setUp(self):
        self.old = sample_record()
        self.new = sample_record()

    def test_identical_replays_no_diffs(self):
        diffs = compare_replays(self.old, self.new)
        self.assertEqual(diffs["action_diffs"], [])
        self.assertEqual(diffs["ask_diffs"], [])

    def test_changed_action_detected(self):
        self.new.nodes[1].detail["action"] = "a2"
        diffs = compare_replays(self.old, self.new)
        self.assertTrue(diffs["action_diffs"])
        self.assertEqual(diffs["action_diffs"][0]["old"], "a1")
        self.assertEqual(diffs["action_diffs"][0]["new"], "a2")

    def test_changed_evidence_detected(self):
        self.new.tool_receipts[0]["ok"] = False
        diffs = compare_replays(self.old, self.new)
        self.assertTrue(diffs["evidence_diffs"])

    def test_compare_same_version_but_different_contract(self):
        self.new.input_envelope["contract_version"] = 2
        diffs = compare_replays(self.old, self.new)
        self.assertTrue(diffs["contract_version_changed"])


if __name__ == "__main__":
    unittest.main()
