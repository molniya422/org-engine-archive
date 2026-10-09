"""P5.1 — tool registry.

验收：未注册工具无法被模型调用。

Default tools (read_file, read_document, create_draft, create_reminder) are
registered at construction; dangerous kinds (send/delete/submit/payment) are
NOT registered by default and require an explicit override=True so the
decision is visible in code review. Every invoke validates parameters against
the input schema and appends {parameters_hash, result_hash} to the call log.
"""

from __future__ import annotations

import hashlib
import json
from typing import Any, Callable

from .contracts import ToolContract, ToolCall, ToolResult, Executor

CallLog = Callable[[dict[str, Any]], None]


def _hash(obj: Any) -> str:
    return hashlib.sha256(
        json.dumps(obj, sort_keys=True, ensure_ascii=False).encode("utf-8")
    ).hexdigest()


def _validate_object(schema: dict[str, Any], params: dict[str, Any]) -> None:
    """Minimal strict object validation — required fields and enum members.
    (Full JSON-Schema validation lives at the API boundary; this guard keeps
    the registry safe even when called in-process.)"""
    if schema.get("type") != "object":
        return
    for key in schema.get("required", []):
        if key not in params:
            raise ValueError(f"missing required parameter '{key}'")
    props = schema.get("properties", {})
    for key, value in params.items():
        if key in props and "enum" in props[key] and value not in props[key]["enum"]:
            raise ValueError(f"parameter '{key}' value {value!r} not in enum {props[key]['enum']}")


def _contract(
    name: str, risk: str, required: list[str], props: dict[str, Any],
    scopes: tuple[str, ...], verifier: str, when_to_use: str,
) -> ToolContract:
    return ToolContract(
        name=name, risk_level=risk,
        input_schema={"type": "object", "required": required, "properties": props},
        output_schema={"type": "object"},
        required_scopes=scopes, verifier=verifier, when_to_use=when_to_use,
    )


DEFAULT_TOOLS: dict[str, ToolContract] = {
    c.name: c
    for c in (
        _contract(
            "read_file", "low", ["path"], {"path": {"type": "string"}},
            ("workspace/",), "read_file",
            "当需要查看用户已授权文件夹内某个文件的内容时使用（例如整理材料前先读取原文）；不要用于 workspace 之外的路径。",
        ),
        _contract(
            "read_document", "low", ["path"],
            {"path": {"type": "string"}, "file_type": {"type": "string", "enum": ["pdf", "docx", "xlsx", "txt", "md"]}},
            ("workspace/",), "read_document",
            "当需要读取文档类内容并提取标题、页码、表格列名或截止日期等结构信息时使用；纯文本小文件用 read_file 更直接。",
        ),
        _contract(
            "create_draft", "low", ["path", "content"],
            {"path": {"type": "string"}, "content": {"type": "string"}},
            ("workspace/",), "create_draft",
            "当需要为用户生成草稿文件（摘要、汇总表、行程草案等）时使用；生成的只是草稿，不会自动发送或提交。",
        ),
        _contract(
            "create_reminder", "low", ["title", "due"],
            {"title": {"type": "string"}, "due": {"type": "string"}, "note": {"type": "string"}},
            ("workspace/",), "create_reminder",
            "当用户明确要求设置提醒（如“明天上午9点提醒我…”）时使用；只创建应用内提醒，不通知第三方。",
        ),
    )
}

# Dangerous kinds are never registered by default. Registration requires
# override=True so the choice is an explicit, reviewable line of code.
FORBIDDEN_BY_DEFAULT = frozenset({"send", "external_send", "delete", "submit", "payment"})


class ToolRegistry:
    def __init__(self, tools: dict[str, ToolContract] | None = None,
                 call_log: CallLog | None = None) -> None:
        self._tools: dict[str, ToolContract] = dict(tools or {})
        self._call_log = call_log

    @classmethod
    def with_defaults(cls, call_log: CallLog | None = None) -> "ToolRegistry":
        return cls(dict(DEFAULT_TOOLS), call_log)

    def register(self, contract: ToolContract, override: bool = False) -> None:
        if contract.name in FORBIDDEN_BY_DEFAULT and not override:
            raise ValueError(
                f"tool '{contract.name}' is dangerous and not registered by default; "
                "register with override=True to make the decision explicit"
            )
        if contract.name in self._tools:
            raise ValueError(f"tool '{contract.name}' already registered")
        self._tools[contract.name] = contract

    def get(self, name: str) -> ToolContract:
        if name not in self._tools:
            raise KeyError(f"tool '{name}' is not registered")
        return self._tools[name]

    def __contains__(self, name: str) -> bool:
        return name in self._tools

    def list(self) -> list[dict[str, Any]]:
        return [c.to_dict() for c in self._tools.values()]

    def invoke(
        self,
        name: str,
        parameters: dict[str, Any],
        executor: Executor | None = None,
    ) -> dict[str, Any]:
        """Invoke a registered tool. Unregistered names raise KeyError BEFORE
        any executor runs — the model cannot call what is not registered.
        Parameters and result hashes are recorded for audit/replay."""
        if name not in self._tools:
            raise KeyError(f"tool '{name}' is not registered — unregistered tools cannot be invoked")
        contract = self.get(name)
        _validate_object(contract.input_schema, parameters)

        call = ToolCall(tool=name, parameters=parameters)
        if executor is None:
            output: dict[str, Any] = {"simulated": True}
            ok, error = True, ""
        else:
            try:
                output = executor(parameters)
                ok, error = True, ""
            except Exception as e:
                output, ok, error = {}, False, str(e)

        result = ToolResult(ok=ok, output=output, error=error)
        if self._call_log:
            self._call_log({
                "tool": name,
                **call.to_dict(),
                **result.to_dict(),
            })
        if not ok:
            raise RuntimeError(f"tool '{name}' execution failed: {error}")
        return output
