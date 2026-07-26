"""Tests for the accountability / per-layer audit / skill-enforcement subsystem.

Covers:
  - record_accountability / set_delegation build the chain (delegated_to/by)
  - audit_accountability rejects empty did/how, and rejects an executor whose
    skill_manifest is missing or non-compliant (THE skill-enforcement point)
  - issue_product_key is gated: no audit -> no signing; rejected audit -> no signing
  - collect_and_audit_chain only collects when ALL downstream audited approved,
    else blocks + escalates
  - trace_accountability walks the chain top->down to a specific executor
  - manager without skill manifest still auditable (managers bound skill optional)
Isolated tempdir state, never touches main.
"""
import sys
import shutil
import tempfile
import unittest
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))
import organization_orchestrator as oo
from organization_orchestrator import (
    OrganizationOrchestrator, Accountability, SkillManifest,
)


def _orch():
    tmp = Path(tempfile.mkdtemp(prefix="org-acct-test-"))
    return OrganizationOrchestrator(states_dir=tmp, session_id="acct-" + oo.uuid.uuid4().hex[:4]), tmp


class TestAccountabilityChain(unittest.TestCase):
    def setUp(self):
        self.orch, self.tmp = _orch()
        self.mgr = self.orch.add_manager("manager_decompose", "FE", parent=None, depth=1)
        self.exec1 = self.orch.add_executor("fe_page_builder", "FE", self.mgr.node_id, depth=3)
        self.exec2 = self.orch.add_executor("fe_ui_system", "FE", self.mgr.node_id, depth=3)

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_record_and_link(self):
        self.orch.record_accountability(self.exec1.node_id,
            did="built login.html", how="followed arch:blog-api contract",
            evidence="file login.html lines 1-260")
        a = self.orch.org[self.exec1.node_id].accountability
        self.assertEqual(a.did, "built login.html")
        self.assertEqual(a.delegated_by, self.mgr.node_id)

    def test_set_delegation_builds_down_edges(self):
        self.orch.set_delegation(self.mgr.node_id,
                                  [self.exec1.node_id, self.exec2.node_id])
        self.assertEqual(self.orch.org[self.mgr.node_id].children,
                         [self.exec1.node_id, self.exec2.node_id])
        self.assertEqual(self.orch.org[self.mgr.node_id].accountability.delegated_to,
                         [self.exec1.node_id, self.exec2.node_id])
        # children's delegated_by points back to the manager
        self.assertEqual(self.orch.org[self.exec1.node_id].accountability.delegated_by,
                         self.mgr.node_id)


class TestSkillEnforcement(unittest.TestCase):
    def setUp(self):
        self.orch, self.tmp = _orch()
        # fe_page_builder bound skill is taste-skill (from registry)
        self.ex = self.orch.add_executor("fe_page_builder", "FE", None, depth=3)
        self.assertEqual(self.ex.bound_skill, "taste-skill")

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def _record(self, manifest):
        self.orch.record_accountability(self.ex.node_id,
            did="built pages", how="used the bound skill",
            evidence="design tokens applied", skill_manifest=manifest)

    def test_compliant_manifest_approved(self):
        m = SkillManifest(skill_used="taste-skill", evidence="tokens/*.css applied",
                          product_ref="fe:pages-login")
        self._record(m)
        self.assertEqual(self.orch.audit_accountability(self.ex.node_id), "approved")

    def test_missing_manifest_executor_rejected(self):
        # executor recorded accountability but no skill manifest at all -> rejected
        self.orch.record_accountability(self.ex.node_id, did="built pages",
            how="vanilla html", evidence="pages")
        self.assertEqual(self.orch.audit_accountability(self.ex.node_id), "rejected")
        reason = self.orch.org[self.ex.node_id].accountability.audit_reason
        self.assertIn("skill manifest", reason)

    def test_wrong_skill_in_manifest_rejected(self):
        # used a DIFFERENT skill than bound -> non-compliant -> rejected
        m = SkillManifest(skill_used="some-other-skill",
                          evidence="did something", product_ref="x")
        self._record(m)
        self.assertEqual(self.orch.audit_accountability(self.ex.node_id), "rejected")
        self.assertIn("non-compliant", self.orch.org[self.ex.node_id].accountability.audit_reason)

    def test_empty_evidence_rejected(self):
        m = SkillManifest(skill_used="taste-skill", evidence="   ", product_ref="x")
        self._record(m)
        self.assertEqual(self.orch.audit_accountability(self.ex.node_id), "rejected")

    def test_empty_did_how_rejected(self):
        m = SkillManifest(skill_used="taste-skill", evidence="ok", product_ref="x")
        self.orch.record_accountability(self.ex.node_id, did="", how="",
            evidence="ok", skill_manifest=m)
        self.assertEqual(self.orch.audit_accountability(self.ex.node_id), "rejected")


class TestProductKeyGating(unittest.TestCase):
    def setUp(self):
        self.orch, self.tmp = _orch()
        self.ex = self.orch.add_executor("fe_page_builder", "FE", None, depth=3)

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_no_audit_no_sign(self):
        # never audited -> cannot sign a product key
        self.assertFalse(self.orch.issue_product_key(self.ex.node_id, "fe:page"))
        self.assertEqual(self.ex.status, "pending")

    def test_rejected_audit_no_sign(self):
        self.orch.record_accountability(self.ex.node_id, did="x", how="y")  # no manifest
        self.orch.audit_accountability(self.ex.node_id)  # rejected
        self.assertFalse(self.orch.issue_product_key(self.ex.node_id, "fe:page"))

    def test_approved_then_signed(self):
        self.orch.record_accountability(self.ex.node_id, did="built", how="ok",
            evidence="e", skill_manifest=SkillManifest(
                skill_used="taste-skill", evidence="ok", product_ref="x"))
        self.assertEqual(self.orch.audit_accountability(self.ex.node_id), "approved")
        self.assertTrue(self.orch.issue_product_key(self.ex.node_id, "fe:page"))
        self.assertEqual(self.ex.status, "done")
        self.assertIn("fe:page", self.ex.product_keys)
        # idempotent
        self.assertTrue(self.orch.issue_product_key(self.ex.node_id, "fe:page"))
        self.assertEqual(len(self.ex.product_keys), 1)


class TestCollectAndAuditChain(unittest.TestCase):
    def setUp(self):
        self.orch, self.tmp = _orch()
        self.mgr = self.orch.add_manager("manager_decompose", "FE", parent=None, depth=1)
        self.e1 = self.orch.add_executor("fe_page_builder", "FE", self.mgr.node_id, depth=3)
        self.e2 = self.orch.add_executor("fe_ui_system", "FE", self.mgr.node_id, depth=3)
        self.orch.set_delegation(self.mgr.node_id, [self.e1.node_id, self.e2.node_id])

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def _approve_executor(self, node):
        self.orch.record_accountability(node.node_id, did="d", how="h", evidence="e",
            skill_manifest=SkillManifest(skill_used=node.bound_skill,
                                         evidence="ok", product_ref="x"))

    def test_all_children_approved_then_collected(self):
        for n in (self.e1, self.e2):
            self._approve_executor(n)
        self.orch.record_accountability(self.mgr.node_id, did="collected dept pkg",
            how="merged e1+e2 outputs", evidence="dept-package-v1")
        res = self.orch.collect_and_audit_chain(self.mgr.node_id)
        self.assertTrue(res["collected"])
        self.assertTrue(all(v == "approved" for v in res["audit"].values()))

    def test_one_child_not_audited_blocks_and_escalates(self):
        self._approve_executor(self.e1)
        # e2 never audited -> chain collection should fail
        self.orch.record_accountability(self.mgr.node_id, did="x", how="y", evidence="z")
        res = self.orch.collect_and_audit_chain(self.mgr.node_id)
        self.assertFalse(res["collected"])
        self.assertEqual(self.mgr.status, "blocked")
        # escalation recorded -> gateway #2 (user arbitration)
        self.assertTrue(self.orch.state().get("escalations"))

    def test_one_child_skill_wrong_blocks(self):
        self._approve_executor(self.e1)
        # e2 used the WRONG skill -> rejected -> chain fails
        self.orch.record_accountability(self.e2.node_id, did="d", how="h", evidence="e",
            skill_manifest=SkillManifest(skill_used="wrong-skill", evidence="ok",
                                         product_ref="x"))
        self.orch.record_accountability(self.mgr.node_id, did="x", how="y", evidence="z")
        res = self.orch.collect_and_audit_chain(self.mgr.node_id)
        self.assertFalse(res["collected"])
        self.assertEqual(res["audit"][self.e2.node_id], "rejected")


class TestTraceAccountability(unittest.TestCase):
    def setUp(self):
        self.orch, self.tmp = _orch()
        self.mgr = self.orch.add_manager("manager_decompose", "FE", parent=None, depth=1)
        self.e1 = self.orch.add_executor("fe_page_builder", "FE", self.mgr.node_id, depth=3)
        self.e2 = self.orch.add_executor("fe_ui_system", "FE", self.mgr.node_id, depth=3)
        self.orch.set_delegation(self.mgr.node_id, [self.e1.node_id, self.e2.node_id])
        for n in (self.e1, self.e2):
            self.orch.record_accountability(n.node_id, did=f"did-{n.role}",
                how="ok", evidence="e",
                skill_manifest=SkillManifest(skill_used=n.bound_skill, evidence="ok",
                                             product_ref="x"))
            self.orch.audit_accountability(n.node_id)
        self.orch.record_accountability(self.mgr.node_id, did="collected", how="merged",
            evidence="pkg")
        self.orch.audit_accountability(self.mgr.node_id)

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_trace_from_top_reaches_executors(self):
        trace = self.orch.trace_accountability(self.mgr.node_id)
        roles = sorted(t["role"] for t in trace)
        self.assertEqual(roles, ["fe_page_builder", "fe_ui_system", "manager_decompose"])
        # the manager's delegated_to edges point to the executors
        mgr_t = next(t for t in trace if t["role"] == "manager_decompose")
        self.assertEqual(set(mgr_t["delegated_to"]),
                         {self.e1.node_id, self.e2.node_id})

    def test_trace_carry_skill_used_and_bound(self):
        trace = self.orch.trace_accountability(self.mgr.node_id)
        e1_t = next(t for t in trace if t["node"] == self.e1.node_id)
        self.assertEqual(e1_t["skill_used"], e1_t["bound_skill"])  # compliant
        self.assertEqual(e1_t["audit_status"], "approved")

    def test_trace_from_executor_only(self):
        # can drill from any node, not just top
        trace = self.orch.trace_accountability(self.e1.node_id)
        self.assertEqual(len(trace), 1)
        self.assertEqual(trace[0]["node"], self.e1.node_id)


if __name__ == "__main__":
    unittest.main(verbosity=2)
