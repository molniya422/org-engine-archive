"""P6.1 — sandbox (simulation mode).

为 TaskContract 创建 isolated run directory。所有写操作重定向到模拟目录；
外部工具替换为 fake tool。输出 action diff、risk summary 和 expected
evidence。结果清晰标记 simulated，绝不生成真实完成证据。
"""

from __future__ import annotations

import hashlib
import json
import re
import shutil
import tempfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable

HIGH_RISK_KINDS = frozenset({"external_send", "delete", "submit", "payment"})
FAKE_TOOLS = frozenset({"external_send", "delete", "submit", "payment"})   # 未注册，永远 fake


@dataclass
class SandboxCall:
    """A planned action to run under simulation."""
    tool: str
    parameters: dict[str, Any] = field(default_factory=dict)
    side_effect: Callable[[Any], None] | None = None   # 若在 sim 中被调用 = 越线

    def parameters_hash(self) -> str:
        return hashlib.sha256(
            json.dumps(self.parameters, sort_keys=True, ensure_ascii=False).encode()
        ).hexdigest()


@dataclass
class SimulatedAction:
    tool: str
    status: str                       # simulated_wrote | simulated_no_effect
    simulated: bool = True
    path: str | None = None
    content: str | None = None
    risk_level: str = "low"

    def to_dict(self) -> dict[str, Any]:
        return {"tool": self.tool, "status": self.status, "simulated": self.simulated,
                "path": self.path, "content": self.content if self.content and self.risk_level == "low" else None,
                "risk_level": self.risk_level}


@dataclass
class SimulationResult:
    simulated: bool = True
    task_id: str = ""
    contract_version: int = 0
    actions: list[SimulatedAction] = field(default_factory=list)
    run_dir: str = ""

    @property
    def overall_status(self) -> str:
        return "simulated" if self.simulated else "unknown"

    def to_dict(self) -> dict[str, Any]:
        risk_summary = {
            "total_actions": len(self.actions),
            "low_risk": sum(1 for a in self.actions if a.risk_level == "low"),
            "medium_risk": sum(1 for a in self.actions if a.risk_level == "medium"),
            "high_risk": sum(1 for a in self.actions if a.risk_level == "high"),
        }
        action_diff = [
            {"tool": a.tool, "diff_type": "create" if a.status == "simulated_wrote" else "no-op",
             "path": a.path, "risk_level": a.risk_level}
            for a in self.actions
        ]
        expected_evidence = [
            {"check": f"{a.tool}_evidence", "verification": "simulated",
             "simulated": True, "path": a.path}
            for a in self.actions
        ]
        return {
            "simulated": self.simulated,
            "status": self.overall_status,
            "task_id": self.task_id,
            "contract_version": self.contract_version,
            "run_dir": self.run_dir,
            "action_diff": action_diff,
            "risk_summary": risk_summary,
            "expected_evidence": expected_evidence,
            "note": "这是模拟运行：没有任何真实文件被修改，也没有产生真实完成证据。",
        }


class SandboxRun:
    """One isolated simulation run for a TaskContract."""

    def __init__(
        self,
        task_contract: dict[str, Any],
        calls: list[SandboxCall],
        workspace_key: str = "workspace",
    ) -> None:
        self.contract = task_contract
        self.calls = calls
        self._workspace_key = workspace_key
        self.run_dir = Path(tempfile.mkdtemp(prefix="sandbox_"))

    # -- path redirection -----------------------------------------------------

    def _redirect(self, path_str: str) -> tuple[Path, str]:
        """Workspace-relative writes land under the run dir; the *logical*
        path (relative to workspace, sanitized) is returned separately so
        action diffs stay stable across runs regardless of the random temp
        run_dir. The real filesystem is never touched."""
        p = Path(path_str)
        parts = [re.sub(r"[^A-Za-z0-9_.\-]", "_", p.name)]
        if len(p.parts) > 1:
            parts.insert(0, re.sub(r"[^A-Za-z0-9_.\-]", "_", p.parent.name))
        rel = "/".join(parts)
        target = self.run_dir.joinpath(*reversed(parts))
        return target, rel

    # -- execution ------------------------------------------------------------

    def execute(self) -> SimulationResult:
        result = SimulationResult(
            simulated=True,
            task_id=str(self.contract.get("id", "")),
            contract_version=int(self.contract.get("contract_version", 0)),
            run_dir=str(self.run_dir),
        )
        for call in self.calls:
            risk = "high" if call.tool in HIGH_RISK_KINDS else "low"
            if call.tool in FAKE_TOOLS:
                # Fake tool: no network, no real side effect. If the call
                # asked for a side_effect, calling it would BE a real effect.
                result.actions.append(SimulatedAction(
                    tool=call.tool, status="simulated_no_effect", risk_level=risk))
                continue
            # Registered write tool → redirect into run dir.
            target, rel = self._redirect(str(call.parameters.get("path", "output.md")))
            content = str(call.parameters.get("content", ""))
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(content, encoding="utf-8")
            result.actions.append(SimulatedAction(
                tool=call.tool, status="simulated_wrote", path=rel,
                content=content, risk_level=risk,
            ))
        return result

    def cleanup(self) -> None:
        shutil.rmtree(self.run_dir, ignore_errors=True)


def simulation_routes_payload(result: SimulationResult) -> dict[str, Any]:
    """Same serialization the HTTP route returns."""
    return result.to_dict()
