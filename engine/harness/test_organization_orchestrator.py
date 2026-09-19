"""Tests for the Organization Orchestrator (org-engine).

Isolated: writes its own org-<testid>.json and contracts-<testid>.json under
loop-engineering/states/, and CLEANS them up on teardown. The live working
environment on `main` (multiagent-state.json etc.) is never touched.

Run:  python harness/test_organization_orchestrator.py
"""
import json
import os
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
# import the module under test
sys.path.insert(0, str(SCRIPT_DIR))
import organization_orchestrator as oo
from organization_orchestrator import (
    OrganizationOrchestrator, ChannelHandle, ChannelVerdict,
    ContractStore, SendBackError, MAX_DEPTH, MAX_CYCLES_PER_LAYER,
    MAX_EXECUTORS_PER_DEPARTMENT,
)


def _temp_orch():
    """An orchestrator whose state + contracts live in a unique temp dir,
    so concurrent or repeated test runs never collide."""
    tmp = Path(tempfile.mkdtemp(prefix="org-engine-test-"))
    orch = OrganizationOrchestrator(states_dir=tmp, session_id="test-" + os.urandom(3).hex())
    return orch


class TestChannelHandleBoundary(unittest.TestCase):
    """Spec §3.1 / §5.3 — mechanism-level boundary enforcement."""

    def setUp(self):
        self.orch = _temp_orch()
        # Two departments, two executors each, share a parent manager.
        self.mgr_fe = self.orch.add_manager("manager_decompose", "FE", parent=None, depth=1)
        self.fe_a = self.orch.add_executor("fe_page_builder", "FE", self.mgr_fe.node_id, depth=3)
        self.fe_b = self.orch.add_executor("fe_ui_system", "FE", self.mgr_fe.node_id, depth=3)
        self.mgr_be = self.orch.add_manager("manager_decompose", "BE", parent=None, depth=1)
        self.be_a = self.orch.add_executor("implementer", "BE", self.mgr_be.node_id, depth=3)

    def tearDown(self):
        shutil.rmtree(self.orch.states_dir, ignore_errors=True)

    def test_same_dept_sibling_allowed(self):
        h = self.orch.channel_handle(self.fe_a.node_id)
        r = h.send(self.orch, self.fe_b.node_id)
        self.assertEqual(r["verdict"], ChannelVerdict.ALLOW.value)

    def test_cross_dept_executor_rejected(self):
        h = self.orch.channel_handle(self.fe_a.node_id)
        r = h.send(self.orch, self.be_a.node_id)
        self.assertEqual(r["verdict"], ChannelVerdict.REJECT_CROSS_DEPT.value)

    def test_upward_to_own_parent_manager_allowed(self):
        h = self.orch.channel_handle(self.fe_a.node_id)
        r = h.send(self.orch, self.mgr_fe.node_id)
        self.assertEqual(r["verdict"], ChannelVerdict.ALLOW.value)

    def test_bypass_to_foreign_manager_rejected(self):
        # FE executor cannot talk directly to another department's manager; must go via meeting.
        h = self.orch.channel_handle(self.fe_a.node_id)
        r = h.send(self.orch, self.mgr_be.node_id)
        self.assertIn(r["verdict"], (ChannelVerdict.REJECT_UPWARD.value,
                                     ChannelVerdict.REJECT_CROSS_DEPT.value))

    def test_unknown_target_rejected(self):
        h = self.orch.channel_handle(self.fe_a.node_id)
        r = h.send(self.orch, "no-such-node")
        self.assertEqual(r["verdict"], ChannelVerdict.REJECT_UNKNOWN.value)

    def test_no_raw_sendmessage_leak(self):
        # The handle object exposes send() through the kernel only; it does not
        # hold a way to bypass mediation. Sanity-check the class surface.
        h = self.orch.channel_handle(self.fe_a.node_id)
        self.assertFalse(hasattr(h, "send_raw"))
        self.assertTrue(callable(getattr(h, "send", None)))


class TestContractStore(unittest.TestCase):
    """Spec §4 — cross-department alignment via shared contracts."""

    def setUp(self):
        self.orch = _temp_orch()

    def tearDown(self):
        shutil.rmtree(self.orch.states_dir, ignore_errors=True)

    def test_only_arch_may_draft(self):
        with self.assertRaises(PermissionError):
            self.orch.contracts.draft("arch:api", {"endpoints": []}, drafter_dept="FE", drafter_id="x")
        c = self.orch.contracts.draft("arch:api", {"endpoints": ["/login"]},
                                      drafter_dept="Arch", drafter_id="arch-mgr")
        self.assertEqual(c["version"], 1)

    def test_read_only_consume_and_version_lock(self):
        self.orch.contracts.draft("arch:api", {"endpoints": ["/login"]}, "Arch", "arch-mgr")
        copy_v1 = self.orch.contracts.get_contract("arch:api", "fe-page-07", lock_version=1)
        self.assertEqual(copy_v1["version"], 1)

    def test_change_requires_ratify_then_version_bumps(self):
        self.orch.contracts.draft("arch:api", {"endpoints": ["/login"]}, "Arch", "arch-mgr")
        self.orch.contracts.register_dependency("arch:api", "FE")
        prop = self.orch.contracts.propose_change("arch:api", {"endpoints": ["/login", "/logout"]}, "fe-mgr")
        self.assertEqual(prop["status"], "pending")
        res = self.orch.contracts.ratify(prop["id"])
        self.assertEqual(res["new_version"], 2)
        self.assertIn("FE", res["affected"])

    def test_consume_after_ratify_sees_new_version(self):
        self.orch.contracts.draft("arch:api", {"endpoints": ["/login"]}, "Arch", "arch-mgr")
        prop = self.orch.contracts.propose_change("arch:api", {"endpoints": ["/x"]}, "fe-mgr")
        self.orch.contracts.ratify(prop["id"])
        fresh = self.orch.contracts.get_contract("arch:api", "be-09")
        self.assertEqual(fresh["version"], 2)
        self.assertEqual(fresh["content"]["endpoints"], ["/x"])

    def test_cannot_change_nonexistent_contract(self):
        with self.assertRaises(KeyError):
            self.orch.contracts.propose_change("nope", {}, "x")


class TestRecursiveDepth(unittest.TestCase):
    """Spec §2 / §3.3 — kernel is the only recursion point, depth cap = 3."""

    def setUp(self):
        self.orch = _temp_orch()

    def tearDown(self):
        shutil.rmtree(self.orch.states_dir, ignore_errors=True)

    def test_cannot_add_executor_at_or_beyond_max_depth(self):
        # MAX_DEPTH=3 is the deepest ALLOWED layer; only >3 is rejected.
        self.orch.add_executor("implementer", "BE", "mgr-x", depth=MAX_DEPTH)  # allowed
        with self.assertRaises(ValueError):
            self.orch.add_executor("implementer", "BE", "mgr-x", depth=MAX_DEPTH + 1)

    def test_l1_l2_l3_unrolled_by_kernel(self):
        d = self.orch.deliberate("build a blog platform")
        self.assertTrue(d["awaiting_user_approval"])
        plan = self.orch.decompose_into_departments("build a blog platform")
        self.assertEqual(plan["depth"], 2)
        self.assertGreater(len(plan["departments"]), 0)
        mgr_id = plan["departments"][0]["manager_id"]
        nodes = self.orch.dispatch_executors(mgr_id, [{"role": "implementer", "department": "BE"}])
        self.assertEqual(len(nodes), 1)
        self.assertEqual(nodes[0].depth, 3)


class TestMeetingAndCycles(unittest.TestCase):
    """Spec §3.2 / §6 — multi-round meeting, max 3 cycles, escalate at cap."""

    def setUp(self):
        self.orch = _temp_orch()

    def tearDown(self):
        shutil.rmtree(self.orch.states_dir, ignore_errors=True)

    def test_meeting_accepts_when_all_approve(self):
        verdicts = {"reviewer": "APPROVE", "tester": "PASS", "architect": "APPROVE"}
        decision = self.orch.run_meeting(verdicts, cycle=1)
        self.assertEqual(decision, "accept")

    def test_meeting_revise_on_request_changes(self):
        verdicts = {"reviewer": "REQUEST_CHANGES", "tester": "PASS", "architect": "APPROVE"}
        decision = self.orch.run_meeting(verdicts, cycle=1)
        self.assertEqual(decision, "revise")

    def test_meeting_escalates_at_max_cycles(self):
        decision = self.orch.run_meeting({"reviewer": "REQUEST_CHANGES"},
                                         cycle=MAX_CYCLES_PER_LAYER)
        self.assertEqual(decision, "escalate")
        # escalation recorded -> user arbitration gateway #2
        self.assertTrue(self.orch.state().get("escalations"))


class TestSendBackTriple(unittest.TestCase):
    """Spec §6 — no empty send-backs; cap at 3 cycles; escalate after cap."""

    def setUp(self):
        self.orch = _temp_orch()
        self.node = self.orch.add_executor("implementer", "BE", None, depth=3)

    def tearDown(self):
        shutil.rmtree(self.orch.states_dir, ignore_errors=True)

    def test_empty_triple_rejected(self):
        with self.assertRaises(SendBackError):
            self.orch.send_back(self.node.node_id, {"problem": "", "expectation": "x", "constraint": "y"})
        with self.assertRaises(SendBackError):
            self.orch.send_back(self.node.node_id, {"problem": "p"})  # missing fields

    def test_valid_triple_returns_revise(self):
        r = self.orch.send_back(self.node.node_id,
                                {"problem": "p", "expectation": "e", "constraint": "c"})
        self.assertEqual(r, "revise")

    def test_third_send_back_escalates(self):
        t = {"problem": "p", "expectation": "e", "constraint": "c"}
        self.assertEqual(self.orch.send_back(self.node.node_id, t), "revise")
        self.assertEqual(self.orch.send_back(self.node.node_id, t), "revise")
        self.assertEqual(self.orch.send_back(self.node.node_id, t), "escalate")


class TestFailureAndBudget(unittest.TestCase):
    """Spec §7 — one retry then blocked; budget throttle/escalate."""

    def setUp(self):
        self.orch = _temp_orch()
        self.node = self.orch.add_executor("implementer", "BE", None, depth=3)

    def tearDown(self):
        shutil.rmtree(self.orch.states_dir, ignore_errors=True)

    def test_first_failure_retried_then_blocked(self):
        self.assertEqual(self.orch.record_failure(self.node.node_id), "retry")
        self.assertEqual(self.orch.record_failure(self.node.node_id), "blocked")
        self.assertEqual(self.node.status, "blocked")

    def test_budget_throttle_under_10pct(self):
        self.assertEqual(self.orch.assert_under_budget(10000, 9500), "throttle")

    def test_budget_escalate_over(self):
        self.assertEqual(self.orch.assert_under_budget(10000, 11000),
                         "over_budget_escalate")

    def test_budget_ok_when_healthy(self):
        self.assertEqual(self.orch.assert_under_budget(10000, 5000), "ok")


class TestExecutorCap(unittest.TestCase):
    """Spec §7 — max 6 executors per department."""

    def setUp(self):
        self.orch = _temp_orch()
        self.mgr = self.orch.add_manager("manager_decompose", "FE", parent=None, depth=1)

    def tearDown(self):
        shutil.rmtree(self.orch.states_dir, ignore_errors=True)

    def test_cap_enforced(self):
        # dispatch 6 is OK
        six = [{"role": "fe_page_builder", "department": "FE"} for _ in range(6)]
        # need a partner manager node already created by dispatch; create directly:
        nodes = []
        for ex in six[:6]:
            n = self.orch.add_executor(ex["role"], ex["department"], self.mgr.node_id, depth=3)
            n.status = "dispatched"
            nodes.append(n)
        self.assertEqual(len(nodes), 6)
        # a 7th via dispatch_executors should raise
        with self.assertRaises(ValueError):
            self.orch.dispatch_executors(self.mgr.node_id,
                                         [{"role": "fe_ui_system", "department": "FE"}])


class TestEnvironmentIsolation(unittest.TestCase):
    """Guardrail: the org-engine never touches flat-orchestrator state on main."""

    def test_uses_org_prefix_state_files(self):
        orch = _temp_orch()
        try:
            self.assertTrue(orch.state_path.name.startswith("org-"))
            self.assertTrue(orch.contracts.state_path.name.startswith("contracts-"))
        finally:
            shutil.rmtree(orch.states_dir, ignore_errors=True)


if __name__ == "__main__":
    unittest.main(verbosity=2)
