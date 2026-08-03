"""JSON-RPC 2.0 stdio adapter wrapping OrganizationOrchestrator.

Reads JSON-RPC requests from stdin, pumps events to stdout as notifications.
Maps the synchronous L1 -> L2 -> L3 flow into async-pausable steps at each
gateway.  The three user-facing gateways are:

    Gateway #1 (L1) — after deliberate(): user approves/rejects the plan.
    Gateway #2 (L2) — when run_meeting() returns "escalate": user decides
                      to arbitrate / override.
    Gateway #3 (L3) — after report_to_user(): user accepts or rejects the
                      final output.
"""
from __future__ import annotations

import json
import sys
import traceback
from pathlib import Path

from harness.organization_orchestrator import (
    OrganizationOrchestrator,
    ChannelVerdict,
)
from harness.org_config_loader import load_org_config
from harness.workflow_config_loader import load_workflow_config


class OrchestratorAdapter:
    """JSON-RPC 2.0 server that drives OrganizationOrchestrator with gateway pauses.

    State machine transitions::

        idle  →  running  →  gateway_l1  →  running  →  ...
                         ↘  cancelled
        gateway_l1  → running  →  gateway_l2 / gateway_l3  →  done / cancelled
    """

    STATES = [
        "idle",
        "running",
        "gateway_l1",
        "gateway_l2",
        "gateway_l3",
        "done",
        "cancelled",
    ]

    def __init__(self) -> None:
        self._orch: OrganizationOrchestrator | None = None
        self._state: str = "idle"
        self._task: str = ""
        self._departments: list[str] = []
        self._workflow: dict | None = None
        self._gateway_context: dict | None = None
        self._running: bool = True

    # ------------------------------------------------------------------
    # JSON-RPC event emission
    # ------------------------------------------------------------------

    def emit_event(self, event_type: str, **kwargs: object) -> None:
        """Write a JSON-RPC 2.0 notification (method="event") to stdout."""
        msg = json.dumps(
            {
                "jsonrpc": "2.0",
                "method": "event",
                "params": {"type": event_type, **kwargs},
            }
        )
        sys.stdout.write(msg + "\n")
        sys.stdout.flush()

    # ------------------------------------------------------------------
    # workflow v2 event emission helpers
    # ------------------------------------------------------------------

    def emit_meeting_started(self, meeting: dict) -> None:
        self.emit_event('meeting_started', meeting=meeting)

    def emit_meeting_cycle(self, meeting: dict) -> None:
        self.emit_event('meeting_cycle', meeting=meeting)

    def emit_message_mediated(self, message: dict) -> None:
        self.emit_event('message_mediated', message=message)

    def emit_decision_recorded(self, decision: dict) -> None:
        self.emit_event('decision_recorded', decision=decision)

    # ------------------------------------------------------------------
    # Request dispatch
    # ------------------------------------------------------------------

    def handle_request(self, request: dict) -> dict | None:
        """Route an incoming JSON-RPC request to the appropriate handler."""
        method = request.get("method")
        params = request.get("params", {})
        req_id = request.get("id")

        if method == "start_run":
            return self._handle_start_run(params, req_id)
        elif method == "submit_decision":
            return self._handle_submit_decision(params, req_id)
        elif method == "cancel_run":
            return self._handle_cancel(params, req_id)

        return {
            "jsonrpc": "2.0",
            "id": req_id,
            "error": {"code": -32601, "message": f"Method not found: {method}"},
        }

    # ------------------------------------------------------------------
    # start_run  (Gateway #1 — L1 deliberation)
    # ------------------------------------------------------------------

    def _handle_start_run(self, params: dict, req_id: int) -> dict:
        """Load config, create orchestrator, begin L1 deliberation, pause.

        State after this handler:  ``gateway_l1``
        """
        try:
            config = load_org_config(params["org_config_path"])
            self._task = params["task_description"]
            states_dir = Path(params.get("output_dir", ".")) / "states"
            states_dir.mkdir(parents=True, exist_ok=True)
            self._orch = OrganizationOrchestrator(states_dir=states_dir)

            # Optional: workflow-config v2 (structure / comm / meetings)。
            # configure_workflow 由后续任务在 OrganizationOrchestrator 上定义；
            # 用 hasattr 防御式调用，保证未升级的旧引擎不加载 workflow 也能跑。
            self._workflow = None
            workflow_path = params.get("workflow_path")
            if workflow_path:
                self._workflow = load_workflow_config(workflow_path)
                if hasattr(self._orch, "configure_workflow"):
                    self._orch.configure_workflow(self._workflow)

            # Determine departments from config —
            # start with required_core, fall back to all departments.
            self._departments = [
                d["name"]
                for d in config["departments"]
                if d.get("required", True)
            ]
            if not self._departments:
                self._departments = [d["name"] for d in config["departments"]]

            self._state = "running"
            self.emit_event("phase_started", layer="L1", phase="deliberation")

            # L1: deliberate
            deliberation = self._orch.deliberate(self._task)
            self.emit_event(
                "executor_dispatched",
                role="kernel",
                dept="Arch",
                node_id="kernel",
            )
            self.emit_event(
                "executor_completed",
                node_id="kernel",
                skill_used="deliberation",
                verdict=str(deliberation.get("recommendation", "")),
            )

            # Pause at Gateway #1
            self._state = "gateway_l1"
            self._gateway_context = deliberation
            self.emit_event(
                "gateway_prompt",
                gateway="L1",
                context=deliberation,
                question="Approve proceeding to L2 decomposition?",
            )
            return {
                "jsonrpc": "2.0",
                "id": req_id,
                "result": {"status": "awaiting_user", "gateway": "L1"},
            }

        except Exception as exc:
            self.emit_event("run_completed", status="blocked", error=str(exc))
            return {
                "jsonrpc": "2.0",
                "id": req_id,
                "error": {"code": -32000, "message": str(exc)},
            }

    # ------------------------------------------------------------------
    # submit_decision  (resume from any gateway)
    # ------------------------------------------------------------------

    def _handle_submit_decision(self, params: dict, req_id: int) -> dict:
        """Provide the user's gateway decision and continue the flow."""
        if not self._orch or self._state not in (
            "gateway_l1",
            "gateway_l2",
            "gateway_l3",
        ):
            return {
                "jsonrpc": "2.0",
                "id": req_id,
                "error": {
                    "code": -32000,
                    "message": "No active gateway — submit_decision called "
                    "when no gateway is open",
                },
            }

        gateway = params.get("gateway")
        decision = params.get("decision")
        self._state = "running"

        try:
            if gateway == "L1" and decision == "approve":
                self._continue_after_l1()
            elif gateway == "L2" and decision in ("arbitrate", "override"):
                self._continue_after_l2(decision)
            elif gateway == "L3" and decision == "accept":
                self._state = "done"
                self.emit_event("run_completed", status="success")
            elif decision in ("reject", "cancel"):
                self._state = "cancelled"
                self.emit_event("run_completed", status="cancelled")
            else:
                return {
                    "jsonrpc": "2.0",
                    "id": req_id,
                    "error": {
                        "code": -32000,
                        "message": f"Invalid decision '{decision}' for "
                        f"gateway '{gateway}'",
                    },
                }

            return {
                "jsonrpc": "2.0",
                "id": req_id,
                "result": {"status": self._state},
            }

        except Exception as exc:
            self.emit_event("run_completed", status="blocked", error=str(exc))
            return {
                "jsonrpc": "2.0",
                "id": req_id,
                "error": {"code": -32000, "message": str(exc)},
            }

    # ------------------------------------------------------------------
    # L2: decompose -> dispatch -> meeting
    # ------------------------------------------------------------------

    def _continue_after_l1(self) -> None:
        """L1 approved -> L2 decompose + executors + meeting.

        If the meeting returns ``accept`` the flow continues straight
        into L3 (``_continue_after_l2``).  If it returns ``escalate``
        the adapter pauses at Gateway #2.
        """
        self.emit_event("phase_started", layer="L2", phase="decompose")

        # L2: decompose into departments
        plan = self._orch.decompose_into_departments(
            self._task, departments=self._departments
        )
        first_dept = (
            plan.get("departments", [{}])[0]
            if plan.get("departments")
            else {}
        )
        self.emit_event(
            "executor_dispatched",
            role="manager_decompose",
            dept="Arch",
            node_id=first_dept.get("manager_id", ""),
        )

        # Dispatch executors for each department
        for dept_info in plan.get("departments", []):
            dept_name = dept_info["department"]
            mgr_id = dept_info["manager_id"]
            # Create a single executor per department with a generated role
            executors = self._orch.dispatch_executors(
                mgr_id,
                [
                    {
                        "role": dept_name.lower() + "_executor",
                        "department": dept_name,
                    }
                ],
            )
            for exe in executors:
                role = getattr(exe, "role", dept_name.lower())
                self.emit_event(
                    "executor_dispatched",
                    role=role,
                    dept=dept_name,
                    node_id=exe.node_id,
                )
                self.emit_event(
                    "executor_completed",
                    node_id=exe.node_id,
                    skill_used="orchestration",
                    verdict="DONE",
                )

        # L2 manager meeting (simulated verdicts; real LLM subagents
        # would provide these in a production deployment)
        self.emit_event("phase_started", layer="L2", phase="meeting")
        meeting = self._orch.run_meeting(
            {"reviewer": "APPROVE", "tester": "PASS", "architect": "APPROVE"},
            cycle=1,
        )
        self.emit_event("audit_passed", node_id="meeting")

        if meeting == "escalate":
            self._state = "gateway_l2"
            self._gateway_context = {"cycle": 1, "meeting": meeting}
            self.emit_event(
                "gateway_prompt",
                gateway="L2",
                context={"cycle": 1, "meeting_decision": meeting},
                question="Meeting escalated. Arbitrate or override budget?",
            )
        else:
            self._continue_after_l2("accept")

    # ------------------------------------------------------------------
    # L3: collect -> audit -> report
    # ------------------------------------------------------------------

    def _continue_after_l2(self, decision: str) -> None:
        """L2 resolved -> L3 collect + audit -> final report.

        State after this handler: ``gateway_l3``
        """
        self.emit_event("phase_started", layer="L3", phase="collection")

        # Collect and audit each manager in the org tree
        for dept_node in self._orch.org.values():
            if dept_node.kind == "manager":
                try:
                    result = self._orch.collect_and_audit_chain(
                        dept_node.node_id
                    )
                    if result.get("collected"):
                        self.emit_event(
                            "audit_passed", node_id=dept_node.node_id
                        )
                    else:
                        self.emit_event(
                            "audit_failed",
                            node_id=dept_node.node_id,
                            reason="collection rejected",
                        )
                except Exception as exc:
                    self.emit_event(
                        "audit_failed",
                        node_id=dept_node.node_id,
                        reason=str(exc),
                    )

        # Final report
        report = self._orch.report_to_user()
        self.emit_event(
            "product_key_issued", node_id="report", product_key="final-report"
        )

        self._state = "gateway_l3"
        self._gateway_context = report
        self.emit_event(
            "gateway_prompt",
            gateway="L3",
            context=report,
            question="Accept the final org-engine output?",
        )

    # ------------------------------------------------------------------
    # cancel_run
    # ------------------------------------------------------------------

    def _handle_cancel(self, params: dict, req_id: int) -> dict:
        """Abort the current run and transition to cancelled state."""
        self._running = False
        self._state = "cancelled"
        self.emit_event("run_completed", status="cancelled")
        return {
            "jsonrpc": "2.0",
            "id": req_id,
            "result": {"status": "cancelled"},
        }

    # ------------------------------------------------------------------
    # Main loop
    # ------------------------------------------------------------------

    def run_forever(self) -> None:
        """Read JSON-RPC 2.0 requests from stdin until EOF or cancel."""
        while self._running:
            try:
                line = sys.stdin.readline()
                if not line:
                    break
                line = line.strip()
                if not line:
                    continue
                request = json.loads(line)
                response = self.handle_request(request)
                if response:
                    sys.stdout.write(json.dumps(response) + "\n")
                    sys.stdout.flush()
            except json.JSONDecodeError as exc:
                sys.stderr.write(f"JSON parse error: {exc}\n")
                sys.stderr.flush()
            except Exception:
                sys.stderr.write(f"Unhandled: {traceback.format_exc()}\n")
                sys.stderr.flush()


def main() -> None:
    """Entry point — create adapter and run the stdio event loop."""
    adapter = OrchestratorAdapter()
    adapter.run_forever()


if __name__ == "__main__":
    main()
