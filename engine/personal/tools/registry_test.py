"""P5.1 tests — tool registry.

验收：未注册工具无法被模型调用。
- 每个工具有名称、输入 schema、输出 schema、risk level、required scopes、verifier。
- 首发只注册 read_file / read_document / create_draft / create_reminder。
- send/delete/submit/payment 默认不注册。
- 每次调用保存参数 hash 和结果 hash。
- 工具描述写"什么时候用"，不只写能做什么。
"""

from __future__ import annotations

import hashlib
import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from personal.tools.contracts import ToolContract, ToolCall, ToolResult
from personal.tools.registry import ToolRegistry, DEFAULT_TOOLS, FORBIDDEN_BY_DEFAULT


def sha(data: str) -> str:
    return hashlib.sha256(data.encode("utf-8")).hexdigest()


class TestToolContract(unittest.TestCase):
    def test_contract_requires_usage_description(self):
        """描述必须写什么时候用——'when_to_use' 为空就拒绝注册。"""
        with self.assertRaises(ValueError):
            ToolContract(
                name="read_file", risk_level="low",
                input_schema={"type": "object"}, output_schema={"type": "object"},
                required_scopes=("workspace/",), verifier="read_file",
                when_to_use="",
            )

    def test_call_record_hashes_parameters_and_result(self):
        call = ToolCall(tool="create_draft", parameters={"path": "a.md", "content": "x"})
        result = ToolResult(ok=True, output={"path": "a.md"})
        d = call.to_dict()
        self.assertEqual(d["parameters_hash"], sha(json.dumps(call.parameters, sort_keys=True)))
        r = result.to_dict()
        self.assertEqual(r["result_hash"], sha(json.dumps(result.output, sort_keys=True)))


class TestRegistry(unittest.TestCase):
    def setUp(self):
        self.registry = ToolRegistry.with_defaults()

    def test_default_tools_registered(self):
        for name in ("read_file", "read_document", "create_draft", "create_reminder"):
            self.assertIn(name, self.registry)

    def test_dangerous_tools_not_registered_by_default(self):
        for name in FORBIDDEN_BY_DEFAULT:
            self.assertNotIn(name, self.registry)

    def test_unregistered_tool_cannot_be_invoked(self):
        """验收：未注册工具无法被调用——即使模型执意要调。"""
        with self.assertRaises(KeyError):
            self.registry.invoke("send", {"to": "x@e.com", "content": "hi"})

    def test_invoke_records_parameter_and_result_hash(self):
        log: list[dict] = []
        registry = ToolRegistry.with_defaults(call_log=log.append)
        registry.invoke("create_draft", {"path": "workspace/a.md", "content": "hi"},
                        executor=lambda p: {"path": p["path"], "bytes": 2})
        self.assertEqual(len(log), 1)
        entry = log[0]
        self.assertEqual(entry["parameters_hash"],
                         sha(json.dumps({"path": "workspace/a.md", "content": "hi"}, sort_keys=True)))
        self.assertEqual(entry["result_hash"],
                         sha(json.dumps({"path": "workspace/a.md", "bytes": 2}, sort_keys=True)))

    def test_input_schema_violation_rejected_before_execution(self):
        contract = self.registry.get("read_file")
        self.assertTrue(contract.input_schema.get("type") == "object")
        with self.assertRaises(ValueError):
            self.registry.invoke("read_file", {"no_path_field": True})

    def test_risk_levels_and_scopes_declared(self):
        c = self.registry.get("create_draft")
        self.assertEqual(c.risk_level, "low")
        self.assertTrue(c.required_scopes)
        self.assertTrue(c.when_to_use)  # 什么时候用，不只写能做什么

    def test_register_duplicate_name_rejected(self):
        with self.assertRaises(ValueError):
            self.registry.register(DEFAULT_TOOLS["read_file"])

    def test_explicit_dangerous_registration_requires_override_flag(self):
        """send 类默认不注册；显式注册必须 override=True，留下审计痕迹。"""
        from personal.tools.contracts import ToolContract

        contract = ToolContract(
            name="external_send", risk_level="high",
            input_schema={"type": "object", "required": ["to"]},
            output_schema={"type": "object"},
            required_scopes=("network/",), verifier="external_send",
            when_to_use="只在用户逐次确认后对外发送内容时使用。",
        )
        with self.assertRaises(ValueError):
            self.registry.register(contract)
        self.registry.register(contract, override=True)
        self.assertIn("external_send", self.registry)


if __name__ == "__main__":
    unittest.main()
