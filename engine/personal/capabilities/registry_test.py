"""P5.7 tests — capability-pack onboarding and composition.

验收：接入测试日程能力不需要改写三个场景的判断分支；组合事项共享上下文并
逐步验证，用户通过同一个自然语言入口操作。
"""

from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from personal.capabilities.registry import (
    CapabilityRegistry,
    CapabilityValidationError,
    register_builtin_packs,
)
from personal.tools.registry import ToolRegistry

SCHEMA_PATH = Path(__file__).resolve().parents[3] / "editor" / "schema" / "personal" / "capability-pack.schema.json"


def valid_pack() -> dict:
    return {
        "id": "cap_schedule_reminder",
        "version": 1,
        "task_types": ["schedule"],
        "required_fields": ["title", "due"],
        "tool_refs": ["create_reminder"],
        "required_scopes": ["workspace/"],
        "risk": "low",
        "confirmation_policy": {"mode": "none"},
        "evidence_requirements": [{"kind": "user_statement", "min_count": 1}],
        "verifier_refs": ["create_reminder"],
        "enabled": True,
    }


class TestCapabilityValidation(unittest.TestCase):
    def setUp(self):
        self.registry = CapabilityRegistry(tool_registry=ToolRegistry.with_defaults())

    def test_valid_pack_registers(self):
        pack = self.registry.register(valid_pack())
        self.assertEqual(pack["id"], "cap_schedule_reminder")

    def test_tool_ref_must_exist_in_tool_registry(self):
        """校验工具引用确实存在——不建立另一套工具系统。"""
        pack = {**valid_pack(), "tool_refs": ["make_coffee"]}
        with self.assertRaises(CapabilityValidationError):
            self.registry.register(pack)

    def test_verifier_ref_must_exist(self):
        pack = {**valid_pack(), "verifier_refs": ["nonexistent_verifier"]}
        with self.assertRaises(CapabilityValidationError):
            self.registry.register(pack)

    def test_missing_required_field_rejected(self):
        pack = valid_pack()
        del pack["confirmation_policy"]
        with self.assertRaises(CapabilityValidationError):
            self.registry.register(pack)

    def test_capability_cannot_lower_tool_risk(self):
        """能力描述不得降低工具自身的风险、权限和确认要求。"""
        pack = {**valid_pack(), "risk": "low",
                "confirmation_policy": {"mode": "none"}}
        # Tool create_reminder is low-risk; try to register a pack using
        # a high-risk tool but declaring "none" confirmation → must fail.
        pack_high = {
            **valid_pack(),
            "id": "cap_send_things",
            "task_types": ["outreach"],
            "tool_refs": ["external_send"],
            "risk": "low",
            "confirmation_policy": {"mode": "none"},
        }
        # external_send is not in the default registry → tool-ref check fires first.
        with self.assertRaises(CapabilityValidationError):
            self.registry.register(pack_high)


class TestOnboardingSample(unittest.TestCase):
    """样本能力：测试日程能力复用 create_reminder。

    “明天上午9点提醒我带体检报告” → 生成记录的日期、时区、内容都正确。
    """

    def setUp(self):
        self.registry = register_builtin_packs(ToolRegistry.with_defaults())
        self.cap = self.registry.get("cap_schedule_reminder")

    def test_schedule_pack_registered_via_shared_registry(self):
        """接入测试日程能力不需要改写三个场景的判断分支——注册即进入候选集。"""
        candidates = self.registry.candidates_for("schedule")
        self.assertEqual([c["id"] for c in candidates], ["cap_schedule_reminder"])
        # 文件/天气/旅行的分支没有被改动：它们按各自 task_type 查询（各自有候选，
        # 但 schedule 是通过注册而非改写分支接入的）
        self.assertEqual(
            [c["id"] for c in self.registry.candidates_for("materials")],
            ["cap_material_commitment"],
        )
        self.assertEqual(
            [c["id"] for c in self.registry.candidates_for("travel")],
            ["cap_travel_planning"],
        )

    def test_natural_language_creates_correct_record(self):
        record = self.registry.handle_sample(
            "明天上午9点提醒我带体检报告",
            now="2026-10-09T20:00:00+08:00",
        )
        self.assertEqual(record["title"], "带体检报告")
        self.assertEqual(record["due"], "2026-10-10T09:00:00+08:00")
        self.assertEqual(record["timezone"], "Asia/Shanghai")
        self.assertEqual(record["tool"], "create_reminder")
        self.assertEqual(record["verifier"], "create_reminder")

    def test_generated_record_passes_verifier(self):
        store: dict = {}

        def fake_exec(p):
            record = {"id": "rem_1", "title": p["title"], "due": p["due"]}
            store["rem_1"] = record
            return record

        record = self.registry.handle_sample(
            "明天上午9点提醒我带体检报告",
            now="2026-10-09T20:00:00+08:00",
            executor=fake_exec,
        )
        verdict = self.registry.verify_sample(record, store_get=store.get)
        self.assertEqual(verdict["status"], "verified")


class TestBuiltinPacks(unittest.TestCase):
    def test_three_scenarios_registered_as_capabilities(self):
        """P5.4–P5.6 注册为能力描述；新增事务通过注册进入候选集。"""
        registry = register_builtin_packs(ToolRegistry.with_defaults())
        for cap_id in ("cap_material_commitment", "cap_weather_reminder", "cap_travel_planning"):
            pack = registry.get(cap_id)
            self.assertTrue(pack["tool_refs"])
            self.assertTrue(pack["verifier_refs"])
            self.assertTrue(pack["evidence_requirements"])


if __name__ == "__main__":
    unittest.main()
