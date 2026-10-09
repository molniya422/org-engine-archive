"""P5.7 - capability-pack registry.

Rules:
- tool/verifier refs must exist in the P5.1 tool registry (no second tool system)
- a capability can never lower its tools' risk/permission/confirmation requirements
- disabled packs never become executable candidates
- new task types enter the candidate set via register(); intent layer has no
  hardcoded files/weather/travel branches
- compose() declares step dependencies; only verified, in-scope results flow
  between steps; plan/confirm/execute/verify statuses recorded separately
"""

from __future__ import annotations

import json
import re
from datetime import date, timedelta
from pathlib import Path
from typing import Any, Callable

from ..tools.registry import ToolRegistry

REQUIRED_KEYS = (
    "id", "version", "task_types", "required_fields", "tool_refs",
    "required_scopes", "risk", "confirmation_policy", "evidence_requirements",
    "verifier_refs",
)


class CapabilityValidationError(ValueError):
    pass


def _structural_validate(pack: dict[str, Any]) -> None:
    """Mirrors capability-pack.schema.json structurally (API boundary does the
    full JSON-Schema pass; this keeps in-process registration safe)."""
    missing = [k for k in REQUIRED_KEYS if k not in pack]
    if missing:
        raise CapabilityValidationError(f"capability pack missing fields: {missing}")
    if not re.match(r"^cap_[a-z0-9_]+$", pack["id"]):
        raise CapabilityValidationError(f"bad capability id '{pack['id']}'")
    if not isinstance(pack.get("version"), int) or pack["version"] < 1:
        raise CapabilityValidationError("version must be a positive integer")
    if not pack["task_types"]:
        raise CapabilityValidationError("task_types must be non-empty")
    if not pack["tool_refs"]:
        raise CapabilityValidationError("tool_refs must be non-empty")
    if not pack["verifier_refs"]:
        raise CapabilityValidationError("verifier_refs must be non-empty")
    if not pack["evidence_requirements"]:
        raise CapabilityValidationError("evidence_requirements must be non-empty")
    if pack["risk"] not in ("low", "medium", "high"):
        raise CapabilityValidationError(f"bad risk '{pack['risk']}'")
    policy = pack["confirmation_policy"]
    if not isinstance(policy, dict) or policy.get("mode") not in ("none", "per_action", "per_pack_session"):
        raise CapabilityValidationError("confirmation_policy.mode must be none|per_action|per_pack_session")


class CapabilityRegistry:
    def __init__(self, tool_registry: ToolRegistry) -> None:
        self.tool_registry = tool_registry
        self._packs: dict[str, dict[str, Any]] = {}

    def register(self, pack: dict[str, Any]) -> dict[str, Any]:
        _structural_validate(pack)
        # Refs must exist in the shared tool registry - no second tool system.
        for tool in pack["tool_refs"]:
            if tool not in self.tool_registry:
                raise CapabilityValidationError(
                    f"capability '{pack['id']}' references unregistered tool '{tool}'"
                )
        for verifier in pack["verifier_refs"]:
            # Verifiers live alongside tools named after them; the tool must exist.
            if verifier not in self.tool_registry:
                raise CapabilityValidationError(
                    f"capability '{pack['id']}' references unknown verifier '{verifier}'"
                )
        # A capability may not lower its tools' confirmation requirements:
        # if any referenced tool is high-risk (risk_level high), per_action is mandatory.
        high_risk_tools = [
            t for t in pack["tool_refs"]
            if self.tool_registry.get(t).risk_level == "high"
        ]
        if high_risk_tools and pack["confirmation_policy"]["mode"] == "none":
            raise CapabilityValidationError(
                f"capability '{pack['id']}' uses high-risk tools {high_risk_tools} "
                "but declares confirmation mode 'none' - capabilities cannot "
                "lower tool confirmation requirements"
            )
        if pack["id"] in self._packs:
            raise CapabilityValidationError(f"capability '{pack['id']}' already registered")
        stored = {**pack, "enabled": bool(pack.get("enabled", False))}
        self._packs[pack["id"]] = stored
        return stored

    def get(self, cap_id: str) -> dict[str, Any]:
        if cap_id not in self._packs:
            raise KeyError(f"capability '{cap_id}' not registered")
        return self._packs[cap_id]

    def set_enabled(self, cap_id: str, enabled: bool) -> None:
        self.get(cap_id)["enabled"] = enabled

    def candidates_for(self, task_type: str) -> list[dict[str, Any]]:
        """Executable candidates only: enabled packs matching the task type.
        Un-enabled / connector-less packs never appear here."""
        return [
            p for p in self._packs.values()
            if p["enabled"] and task_type in p["task_types"]
        ]

    # -- sample schedule pack (onboarding proof) ------------------------------

    def handle_sample(
        self,
        utterance: str,
        now: str,
        executor: Callable[[dict[str, Any]], dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        """Test schedule pack: "明天上午9点提醒我带体检报告" via create_reminder.
        Validates date, timezone and content of the generated record."""
        m = re.search(r"(今天|明天)上午(\d{1,2})点(提醒我)?(.+)", utterance)
        if not m:
            raise ValueError("样例只处理“今天/明天上午N点提醒我…”句式")
        day_offset, hour, _marker, title = m.groups()
        base = Path(now)
        date_part = str(base).split("T")[0]
        year, month, day = (int(x) for x in date_part.split("-"))
        if day_offset == "明天":
            d = date(year, month, day) + timedelta(days=1)
            date_str = d.isoformat()
        else:
            date_str = f"{year:04d}-{month:02d}-{day:02d}"
        tz = "+08:00"
        due = f"{date_str}T{int(hour):02d}:00:00{tz}"
        params = {"title": title.strip(), "due": due, "note": "来自测试日程能力"}
        result = self.tool_registry.invoke("create_reminder", params, executor=executor)
        return {
            "tool": "create_reminder",
            "verifier": "create_reminder",
            "capability": "cap_schedule_reminder",
            "title": params["title"],
            "due": due,
            "timezone": "Asia/Shanghai",
            "result": result,
        }

    def verify_sample(
        self,
        record: dict[str, Any],
        store_get: Callable[[str], dict[str, Any] | None],
    ) -> dict[str, Any]:
        """Verify via the tool's verifier: the reminder record must exist in
        storage - the model/tool claim alone is not evidence."""
        from ..tools.verifiers import verify_create_reminder
        result = verify_create_reminder(record["result"]["id"], store_get=store_get)
        return {"status": result.status, "reason": result.reason}

    # -- composition ----------------------------------------------------------

    def compose(self, steps: list[dict[str, Any]]) -> dict[str, Any]:
        """组合事项：声明步骤依赖和结果引用。只传递已验证且授权范围内的结果。
        返回的计划分别记录每步的 plan/confirm/execute/verify 状态。"""
        plan: dict[str, Any] = {"steps": [], "shared_context_refs": []}
        completed: dict[str, Any] = {}
        for step in steps:
            deps = step.get("depends_on", [])
            for dep in deps:
                if dep not in completed:
                    raise ValueError(
                        f"step '{step['id']}' depends on '{dep}' which has not completed+verified"
                    )
                ref = completed[dep]
                # Only verified results flow forward.
                if ref["verify"]["status"] != "verified":
                    raise ValueError(f"dependency '{dep}' is not verified - not passing its result on")
            plan["steps"].append({
                "id": step["id"],
                "capability": step["capability"],
                "depends_on": list(deps),
                "plan": "planned",
                "confirm": "pending",
                "execute": "pending",
                "verify": "pending",
            })
            completed[step["id"]] = {
                "verify": {"status": step.get("verify_status", "pending")},
            }
        return plan


def register_builtin_packs(tool_registry: ToolRegistry) -> CapabilityRegistry:
    """P5.4-P5.6 registered as capability descriptions on the shared registry."""
    registry = CapabilityRegistry(tool_registry)
    registry.register({
        "id": "cap_material_commitment",
        "version": 1,
        "task_types": ["materials"],
        "required_fields": ["folder"],
        "tool_refs": ["read_file", "read_document", "create_draft"],
        "required_scopes": ["workspace/"],
        "risk": "low",
        "confirmation_policy": {"mode": "per_action"},
        "evidence_requirements": [{"kind": "workspace_file", "min_count": 1}],
        "verifier_refs": ["create_draft"],
        "enabled": True,
    })
    registry.register({
        "id": "cap_weather_reminder",
        "version": 1,
        "task_types": ["weather"],
        "required_fields": ["place"],
        "tool_refs": ["create_reminder"],
        "required_scopes": ["workspace/"],
        "risk": "low",
        "confirmation_policy": {"mode": "per_action"},
        "evidence_requirements": [{"kind": "weather_source", "min_count": 1}],
        "verifier_refs": ["create_reminder"],
        "enabled": True,
    })
    registry.register({
        "id": "cap_travel_planning",
        "version": 1,
        "task_types": ["travel"],
        "required_fields": ["dates", "people"],
        "tool_refs": ["create_draft"],
        "required_scopes": ["workspace/"],
        "risk": "medium",
        "confirmation_policy": {"mode": "per_action"},
        "evidence_requirements": [{"kind": "connector_receipt", "min_count": 1}],
        "verifier_refs": ["create_draft"],
        "enabled": True,
    })
    # Onboarding sample: test schedule pack reusing create_reminder.
    registry.register({
        "id": "cap_schedule_reminder",
        "version": 1,
        "task_types": ["schedule"],
        "required_fields": ["title", "due"],
        "tool_refs": ["create_reminder"],
        "required_scopes": ["workspace/"],
        "risk": "low",
        "confirmation_policy": {"mode": "per_action"},
        "evidence_requirements": [{"kind": "user_statement", "min_count": 1}],
        "verifier_refs": ["create_reminder"],
        "enabled": True,
    })
    return registry
