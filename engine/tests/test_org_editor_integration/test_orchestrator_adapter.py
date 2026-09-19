"""Tests for the OrganizationOrchestrator JSON-RPC stdio adapter.

All tests use mocks for both ``OrganizationOrchestrator`` and
``load_org_config`` so they run offline with no filesystem dependencies.
"""
from __future__ import annotations

import json
from unittest.mock import MagicMock, patch

import pytest


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_org_node(
    node_id: str,
    kind: str = "executor",
    department: str = "FE",
    role: str = "fe_executor",
) -> MagicMock:
    """Create a minimal mock OrgNode-like object."""
    node = MagicMock()
    node.node_id = node_id
    node.kind = kind
    node.department = department
    node.role = role
    node.product_keys = []
    return node


DEFAULT_CONFIG = {
    "org_name": "test-org",
    "departments": [
        {
            "name": "Arch",
            "required": True,
            "roles": [{"name": "tech_lead", "agentType": "general-purpose"}],
            "manager_pipeline": [],
        },
        {
            "name": "FE",
            "required": True,
            "roles": [{"name": "fe_page_builder", "agentType": "general-purpose"}],
            "manager_pipeline": [],
        },
        {
            "name": "BE",
            "required": True,
            "roles": [{"name": "implementer", "agentType": "general-purpose"}],
            "manager_pipeline": [],
        },
    ],
    "contracts": [],
    "budget": {},
}

DEFAULT_DELIBERATION = {
    "gateway": 1,
    "feasibility": "on",
    "necessity": "assessed",
    "budget": None,
    "recommendation": "proceed to decomposition",
    "task": "Build a test",
    "awaiting_user_approval": True,
}


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


class TestStartRun:
    """start_run: config loading, orchestrator creation, L1 deliberation."""

    @patch("harness.orchestrator_adapter.OrganizationOrchestrator")
    @patch("harness.orchestrator_adapter.load_org_config")
    def test_happy_path(self, mock_load: MagicMock, mock_orch_cls: MagicMock) -> None:
        """Happy path: should return awaiting_user with gateway L1."""
        mock_orch = MagicMock()
        mock_orch_cls.return_value = mock_orch
        mock_orch.deliberate.return_value = dict(DEFAULT_DELIBERATION)
        mock_load.return_value = dict(DEFAULT_CONFIG)

        from harness.orchestrator_adapter import OrchestratorAdapter

        adapter = OrchestratorAdapter()
        result = adapter.handle_request(
            {
                "jsonrpc": "2.0",
                "id": 1,
                "method": "start_run",
                "params": {
                    "org_config_path": "/tmp/test.yaml",
                    "task_description": "Build a test",
                    "output_dir": "/tmp/output",
                },
            }
        )

        assert result["id"] == 1
        assert result["result"]["status"] == "awaiting_user"
        assert result["result"]["gateway"] == "L1"
        assert adapter._state == "gateway_l1"  # noqa: SLF001
        mock_orch.deliberate.assert_called_once_with("Build a test")

    @patch("harness.orchestrator_adapter.OrganizationOrchestrator")
    @patch("harness.orchestrator_adapter.load_org_config")
    def test_config_not_found(
        self, mock_load: MagicMock, mock_orch_cls: MagicMock
    ) -> None:
        """Missing config file should return a JSON-RPC error."""
        mock_load.side_effect = FileNotFoundError("No such file")

        from harness.orchestrator_adapter import OrchestratorAdapter

        adapter = OrchestratorAdapter()
        result = adapter.handle_request(
            {
                "jsonrpc": "2.0",
                "id": 1,
                "method": "start_run",
                "params": {
                    "org_config_path": "/tmp/missing.yaml",
                    "task_description": "x",
                    "output_dir": "/tmp/o",
                },
            }
        )

        assert "error" in result
        assert result["error"]["code"] == -32000

    @patch("harness.orchestrator_adapter.OrganizationOrchestrator")
    @patch("harness.orchestrator_adapter.load_org_config")
    def test_empty_departments_fallback(
        self, mock_load: MagicMock, mock_orch_cls: MagicMock
    ) -> None:
        """When no departments have required=True, fall back to all."""
        mock_orch = MagicMock()
        mock_orch_cls.return_value = mock_orch
        mock_orch.deliberate.return_value = dict(DEFAULT_DELIBERATION)
        # All departments are optional
        config = dict(DEFAULT_CONFIG)
        for d in config["departments"]:
            d["required"] = False
        mock_load.return_value = config

        from harness.orchestrator_adapter import OrchestratorAdapter

        adapter = OrchestratorAdapter()
        result = adapter.handle_request(
            {
                "jsonrpc": "2.0",
                "id": 1,
                "method": "start_run",
                "params": {
                    "org_config_path": "/tmp/t.yaml",
                    "task_description": "t",
                    "output_dir": "/tmp/o",
                },
            }
        )

        assert "result" in result
        # All three departments should be picked up as fallback
        assert len(adapter._departments) == 3  # noqa: SLF001


class TestSubmitDecision:
    """submit_decision: resuming from each gateway."""

    # ------------------------------------------------------------------
    # Gateway L1 -> approve
    # ------------------------------------------------------------------

    @patch("harness.orchestrator_adapter.OrganizationOrchestrator")
    @patch("harness.orchestrator_adapter.load_org_config")
    def test_gateway_l1_approve(
        self, mock_load: MagicMock, mock_orch_cls: MagicMock
    ) -> None:
        """Approve L1 -> L2 flow runs -> lands in L3 (no escalation)."""
        mock_orch = MagicMock()
        mock_orch_cls.return_value = mock_orch
        mock_orch.deliberate.return_value = dict(DEFAULT_DELIBERATION)
        mock_orch.decompose_into_departments.return_value = {
            "departments": [
                {"department": "FE", "manager_id": "mgr-fe-001"},
                {"department": "BE", "manager_id": "mgr-be-002"},
            ],
            "depth": 2,
        }

        # dispatch_executors side effect returns proper mock nodes
        def _dispatch(_mgr_id: str, exec_list: list[dict]) -> list[MagicMock]:
            return [
                _make_org_node(
                    node_id=f"exec-{e['role']}-001",
                    kind="executor",
                    department=e["department"],
                    role=e["role"],
                )
                for e in exec_list
            ]

        mock_orch.dispatch_executors.side_effect = _dispatch
        mock_orch.run_meeting.return_value = "accept"
        mock_orch.report_to_user.return_value = {
            "gateway": 3,
            "org_size": 0,
            "messages": 0,
            "escalations": [],
            "audit_log_size": 0,
            "awaiting_user_decision": True,
        }
        # An empty org dict means no managers to iterate in L3 collection
        mock_orch.org = {}
        mock_load.return_value = dict(DEFAULT_CONFIG)

        from harness.orchestrator_adapter import OrchestratorAdapter

        adapter = OrchestratorAdapter()
        adapter.handle_request(
            {
                "jsonrpc": "2.0",
                "id": 1,
                "method": "start_run",
                "params": {
                    "org_config_path": "/tmp/t.yaml",
                    "task_description": "t",
                    "output_dir": "/tmp/o",
                },
            }
        )

        result = adapter.handle_request(
            {
                "jsonrpc": "2.0",
                "id": 2,
                "method": "submit_decision",
                "params": {"gateway": "L1", "decision": "approve"},
            }
        )

        assert "result" in result
        # Accept path goes right through L2 -> L3 -> gateway_l3
        assert result["result"]["status"] == "gateway_l3"
        mock_orch.decompose_into_departments.assert_called_once()
        mock_orch.run_meeting.assert_called_once()
        mock_orch.report_to_user.assert_called_once()

    @patch("harness.orchestrator_adapter.OrganizationOrchestrator")
    @patch("harness.orchestrator_adapter.load_org_config")
    def test_gateway_l1_reject(
        self, mock_load: MagicMock, mock_orch_cls: MagicMock
    ) -> None:
        """Reject at L1 should cancel the run."""
        mock_orch = MagicMock()
        mock_orch_cls.return_value = mock_orch
        mock_orch.deliberate.return_value = dict(DEFAULT_DELIBERATION)
        mock_load.return_value = dict(DEFAULT_CONFIG)

        from harness.orchestrator_adapter import OrchestratorAdapter

        adapter = OrchestratorAdapter()
        adapter.handle_request(
            {
                "jsonrpc": "2.0",
                "id": 1,
                "method": "start_run",
                "params": {
                    "org_config_path": "/tmp/t.yaml",
                    "task_description": "t",
                    "output_dir": "/tmp/o",
                },
            }
        )

        result = adapter.handle_request(
            {
                "jsonrpc": "2.0",
                "id": 2,
                "method": "submit_decision",
                "params": {"gateway": "L1", "decision": "reject"},
            }
        )

        assert "result" in result
        assert result["result"]["status"] == "cancelled"

    # ------------------------------------------------------------------
    # Gateway L2 (escalation)
    # ------------------------------------------------------------------

    @patch("harness.orchestrator_adapter.OrganizationOrchestrator")
    @patch("harness.orchestrator_adapter.load_org_config")
    def test_gateway_l2_escalate_then_arbitrate(
        self, mock_load: MagicMock, mock_orch_cls: MagicMock
    ) -> None:
        """Meeting escalates -> user arbitrates -> flow continues to L3."""
        mock_orch = MagicMock()
        mock_orch_cls.return_value = mock_orch
        mock_orch.deliberate.return_value = dict(DEFAULT_DELIBERATION)
        mock_orch.decompose_into_departments.return_value = {
            "departments": [
                {"department": "Arch", "manager_id": "mgr-arch-001"},
                {"department": "FE", "manager_id": "mgr-fe-001"},
            ],
            "depth": 2,
        }

        def _dispatch(_mgr_id: str, exec_list: list[dict]) -> list[MagicMock]:
            return [
                _make_org_node(
                    node_id=f"exec-{e['role']}-001",
                    kind="executor",
                    department=e["department"],
                    role=e["role"],
                )
                for e in exec_list
            ]

        mock_orch.dispatch_executors.side_effect = _dispatch
        # Return "escalate" so the flow pauses at gateway_l2
        mock_orch.run_meeting.return_value = "escalate"
        mock_orch.collect_and_audit_chain.return_value = {
            "collected": True,
            "audit": {},
            "own": "approved",
        }
        mock_orch.report_to_user.return_value = {
            "gateway": 3,
            "org_size": 0,
            "messages": 0,
            "escalations": [],
            "audit_log_size": 0,
            "awaiting_user_decision": True,
        }
        mock_orch.org = {}
        mock_load.return_value = dict(DEFAULT_CONFIG)

        from harness.orchestrator_adapter import OrchestratorAdapter

        adapter = OrchestratorAdapter()
        adapter.handle_request(
            {
                "jsonrpc": "2.0",
                "id": 1,
                "method": "start_run",
                "params": {
                    "org_config_path": "/tmp/t.yaml",
                    "task_description": "t",
                    "output_dir": "/tmp/o",
                },
            }
        )

        # First approval triggers L2, meeting escalates
        adapter.handle_request(
            {
                "jsonrpc": "2.0",
                "id": 2,
                "method": "submit_decision",
                "params": {"gateway": "L1", "decision": "approve"},
            }
        )

        assert adapter._state == "gateway_l2"  # noqa: SLF001

        # User arbitrates
        result = adapter.handle_request(
            {
                "jsonrpc": "2.0",
                "id": 3,
                "method": "submit_decision",
                "params": {"gateway": "L2", "decision": "arbitrate"},
            }
        )

        assert "result" in result
        # Should continue through L3 and land at gateway_l3
        assert result["result"]["status"] == "gateway_l3"

    # ------------------------------------------------------------------
    # Gateway L3
    # ------------------------------------------------------------------

    @patch("harness.orchestrator_adapter.OrganizationOrchestrator")
    @patch("harness.orchestrator_adapter.load_org_config")
    def test_gateway_l3_accept(
        self, mock_load: MagicMock, mock_orch_cls: MagicMock
    ) -> None:
        """Accept final report -> done."""
        mock_orch = MagicMock()
        mock_orch_cls.return_value = mock_orch
        mock_orch.deliberate.return_value = dict(DEFAULT_DELIBERATION)
        # Provide a plan so _continue_after_l1 can iterate
        mock_orch.decompose_into_departments.return_value = {
            "departments": [],
            "depth": 2,
        }
        mock_orch.run_meeting.return_value = "accept"
        mock_orch.report_to_user.return_value = {
            "gateway": 3,
            "org_size": 0,
            "messages": 0,
            "escalations": [],
            "audit_log_size": 0,
            "awaiting_user_decision": True,
        }
        mock_orch.org = {}
        mock_load.return_value = dict(DEFAULT_CONFIG)

        from harness.orchestrator_adapter import OrchestratorAdapter

        adapter = OrchestratorAdapter()
        adapter.handle_request(
            {
                "jsonrpc": "2.0",
                "id": 1,
                "method": "start_run",
                "params": {
                    "org_config_path": "/tmp/t.yaml",
                    "task_description": "t",
                    "output_dir": "/tmp/o",
                },
            }
        )
        # Go through L1 -> L2 -> L3 -> gate L3
        adapter.handle_request(
            {
                "jsonrpc": "2.0",
                "id": 2,
                "method": "submit_decision",
                "params": {"gateway": "L1", "decision": "approve"},
            }
        )

        # Accept at L3
        result = adapter.handle_request(
            {
                "jsonrpc": "2.0",
                "id": 3,
                "method": "submit_decision",
                "params": {"gateway": "L3", "decision": "accept"},
            }
        )

        assert "result" in result
        assert result["result"]["status"] == "done"

    @patch("harness.orchestrator_adapter.OrganizationOrchestrator")
    @patch("harness.orchestrator_adapter.load_org_config")
    def test_gateway_l3_reject(
        self, mock_load: MagicMock, mock_orch_cls: MagicMock
    ) -> None:
        """Reject at L3 -> cancelled."""
        mock_orch = MagicMock()
        mock_orch_cls.return_value = mock_orch
        mock_load.return_value = dict(DEFAULT_CONFIG)

        from harness.orchestrator_adapter import OrchestratorAdapter

        adapter = OrchestratorAdapter()
        adapter._orch = mock_orch
        adapter._state = "gateway_l3"

        result = adapter.handle_request(
            {
                "jsonrpc": "2.0",
                "id": 3,
                "method": "submit_decision",
                "params": {"gateway": "L3", "decision": "reject"},
            }
        )

        assert result["result"]["status"] == "cancelled"


class TestCancelRun:
    """cancel_run should stop the event loop and transition to cancelled."""

    @patch("harness.orchestrator_adapter.OrganizationOrchestrator")
    @patch("harness.orchestrator_adapter.load_org_config")
    def test_cancel_active_run(
        self, mock_load: MagicMock, mock_orch_cls: MagicMock
    ) -> None:
        """Cancel at L1 gateway should succeed."""
        mock_orch = MagicMock()
        mock_orch_cls.return_value = mock_orch
        mock_orch.deliberate.return_value = dict(DEFAULT_DELIBERATION)
        mock_load.return_value = dict(DEFAULT_CONFIG)

        from harness.orchestrator_adapter import OrchestratorAdapter

        adapter = OrchestratorAdapter()
        adapter.handle_request(
            {
                "jsonrpc": "2.0",
                "id": 1,
                "method": "start_run",
                "params": {
                    "org_config_path": "/tmp/t.yaml",
                    "task_description": "t",
                    "output_dir": "/tmp/o",
                },
            }
        )

        result = adapter.handle_request(
            {"jsonrpc": "2.0", "id": 2, "method": "cancel_run", "params": {}}
        )

        assert result["result"]["status"] == "cancelled"
        assert adapter._state == "cancelled"  # noqa: SLF001
        assert not adapter._running  # noqa: SLF001


class TestErrors:
    """Error handling."""

    def test_unknown_method(self) -> None:
        """Unknown method returns JSON-RPC code -32601."""
        from harness.orchestrator_adapter import OrchestratorAdapter

        adapter = OrchestratorAdapter()
        result = adapter.handle_request(
            {"jsonrpc": "2.0", "id": 99, "method": "bogus", "params": {}}
        )
        assert "error" in result
        assert result["error"]["code"] == -32601

    @patch("harness.orchestrator_adapter.OrganizationOrchestrator")
    @patch("harness.orchestrator_adapter.load_org_config")
    def test_submit_no_active_gateway(
        self, mock_load: MagicMock, mock_orch_cls: MagicMock
    ) -> None:
        """submit_decision without an active gateway returns error."""
        mock_orch = MagicMock()
        mock_orch_cls.return_value = mock_orch
        mock_orch.deliberate.return_value = dict(DEFAULT_DELIBERATION)
        mock_load.return_value = dict(DEFAULT_CONFIG)

        from harness.orchestrator_adapter import OrchestratorAdapter

        adapter = OrchestratorAdapter()
        result = adapter.handle_request(
            {
                "jsonrpc": "2.0",
                "id": 1,
                "method": "submit_decision",
                "params": {"gateway": "L1", "decision": "approve"},
            }
        )
        assert "error" in result
        assert result["error"]["code"] == -32000  # no active gateway

    @patch("harness.orchestrator_adapter.OrganizationOrchestrator")
    @patch("harness.orchestrator_adapter.load_org_config")
    def test_invalid_decision(
        self, mock_load: MagicMock, mock_orch_cls: MagicMock
    ) -> None:
        """Invalid decision for the gateway returns error."""
        mock_orch = MagicMock()
        mock_orch_cls.return_value = mock_orch
        mock_orch.deliberate.return_value = dict(DEFAULT_DELIBERATION)
        mock_load.return_value = dict(DEFAULT_CONFIG)

        from harness.orchestrator_adapter import OrchestratorAdapter

        adapter = OrchestratorAdapter()
        adapter.handle_request(
            {
                "jsonrpc": "2.0",
                "id": 1,
                "method": "start_run",
                "params": {
                    "org_config_path": "/tmp/t.yaml",
                    "task_description": "t",
                    "output_dir": "/tmp/o",
                },
            }
        )

        # APPROVE is not a valid decision keyword; the VM rejects via
        # the "reject"/"cancel" catch-all, but the gateway mismatch
        # means "invalid decision" if approve is not a known decision.
        # Actually - the code checks decision == "reject"/"cancel"
        # catch-all, so "approve" goes to the else branch: invalid.
        result = adapter.handle_request(
            {
                "jsonrpc": "2.0",
                "id": 2,
                "method": "submit_decision",
                "params": {"gateway": "L1", "decision": "APPROVE"},
            }
        )
        assert "error" in result
        assert result["error"]["code"] == -32000


class TestLifecycle:
    """End-to-end state machine transitions."""

    @patch("harness.orchestrator_adapter.OrganizationOrchestrator")
    @patch("harness.orchestrator_adapter.load_org_config")
    def test_full_happy_path(
        self, mock_load: MagicMock, mock_orch_cls: MagicMock
    ) -> None:
        """idle -> start -> L1 -> L2 -> L3 -> done."""
        mock_orch = MagicMock()
        mock_orch_cls.return_value = mock_orch
        mock_orch.deliberate.return_value = dict(DEFAULT_DELIBERATION)
        mock_orch.decompose_into_departments.return_value = {
            "departments": [],
            "depth": 2,
        }
        mock_orch.dispatch_executors.return_value = []
        mock_orch.run_meeting.return_value = "accept"
        mock_orch.report_to_user.return_value = {
            "gateway": 3,
            "org_size": 0,
            "messages": 0,
            "escalations": [],
            "audit_log_size": 0,
            "awaiting_user_decision": True,
        }
        mock_orch.org = {}
        mock_load.return_value = dict(DEFAULT_CONFIG)

        from harness.orchestrator_adapter import OrchestratorAdapter

        adapter = OrchestratorAdapter()
        assert adapter._state == "idle"  # noqa: SLF001

        # start_run
        r1 = adapter.handle_request(
            {
                "jsonrpc": "2.0",
                "id": 1,
                "method": "start_run",
                "params": {
                    "org_config_path": "/tmp/t.yaml",
                    "task_description": "t",
                    "output_dir": "/tmp/o",
                },
            }
        )
        assert r1["result"]["status"] == "awaiting_user"
        assert r1["result"]["gateway"] == "L1"
        assert adapter._state == "gateway_l1"  # noqa: SLF001

        # L1 approve -> goes to L2 -> L3 -> gateway_l3
        r2 = adapter.handle_request(
            {
                "jsonrpc": "2.0",
                "id": 2,
                "method": "submit_decision",
                "params": {"gateway": "L1", "decision": "approve"},
            }
        )
        assert r2["result"]["status"] == "gateway_l3"
        assert adapter._state == "gateway_l3"  # noqa: SLF001

        # L3 accept -> done
        r3 = adapter.handle_request(
            {
                "jsonrpc": "2.0",
                "id": 3,
                "method": "submit_decision",
                "params": {"gateway": "L3", "decision": "accept"},
            }
        )
        assert r3["result"]["status"] == "done"
        assert adapter._state == "done"  # noqa: SLF001
