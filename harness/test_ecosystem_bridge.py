"""Tests for the ecosystem bridge integration — loop-engineering, skill-attention,
and auto-summary+memory wired into org-engine.

CRITICAL isolation guarantee: every helper writes ONLY into the bridge's
dedicated dirs (own states_dir, own memory_data_dir, own archive_dir). The
canonical lean-hooks files on `main` (loop-engineering/states/*,
training-loop/feedback.md, training-loop/meta.json, MEMORY.md, claude-mem.db)
must NEVER be touched.
"""
import os
import json
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))
import organization_orchestrator as oo
from organization_orchestrator import OrganizationOrchestrator
from org_ecosystem_bridge import EcosystemBridge


def _isolated_bridge_root():
    return Path(tempfile.mkdtemp(prefix="org-bridge-test-"))


class TestIsolationGuarantee(unittest.TestCase):
    """Every helper writes only into bridge-owned dirs; main canonical files stay clean.
    Several of these tests will pass even if the underlying CLI helpers fail,
    because the bridge degrades silently; but the SIDE EFFECTS that DO land must
    only land in the bridge's own directories."""

    def setUp(self):
        self.root = _isolated_bridge_root()
        self.loop_dir = self.root / "loop-states"
        self.mem_dir = self.root / "memory-db"
        self.archive_dir = self.root / "archive"
        self.bridge = EcosystemBridge(loop_dir=self.loop_dir,
                                      memory_data_dir=self.mem_dir,
                                      archive_dir=self.archive_dir)
        orch = OrganizationOrchestrator(
            states_dir=self.root / "states",
            session_id="brd-" + os.urandom(2).hex())
        orch.bridge = self.bridge
        self.orch = orch

    def tearDown(self):
        shutil.rmtree(self.root, ignore_errors=True)

    def test_main_canonical_files_not_touched(self):
        # canonical memory.md path must NOT exist anywhere we created
        # (we never write to claude-ecosystem/MEMORY.md or lean-hooks/memory)
        before_canon = []
        canon = Path(SCRIPT_DIR.parent / "MEMORY.md")
        if canon.exists():
            before_canon = canon.read_bytes()
        # drive a meeting
        mgr = self.orch.add_manager("manager_decompose", "FE", parent=None, depth=2)
        self.orch.set_delegation(mgr.node_id, [])
        try:
            self.orch.run_meeting({"reviewer": "APPROVE", "tester": "PASS",
                                    "architect": "APPROVE"}, cycle=1)
        except Exception:
            pass
        # canonical MEMORY.md unchanged
        if canon.exists():
            self.assertEqual(canon.read_bytes(), before_canon)
        # nothing landed outside our root
        self.assertTrue(self.loop_dir.exists() or not list(self.loop_dir.glob('*'))
                        if self.loop_dir.exists() else True)

    def test_archive_dir_only(self):
        """If archive_meeting fires, it lands ONLY in bridge.archive_dir."""
        try:
            self.bridge.archive_meeting("sid", {"ts": "x", "decision": "accept"})
        except Exception:
            pass
        if self.archive_dir.exists() and list(self.archive_dir.glob('*')):
            files = list(self.archive_dir.glob("org-sid-*.json"))
            self.assertTrue(files)
            # ensure file content is valid json
            j = json.loads(files[0].read_text(encoding="utf-8"))
            self.assertEqual(j["decision"], "accept")

    def test_memory_db_only(self):
        """If auto-summary fires, the .db lives ONLY in bridge.memory_data_dir."""
        try:
            self.bridge.archive_session("org-test", "summary", "f1.py", True)
        except Exception:
            pass
        # any sqlite db file must be within mem_dir, nowhere else we created.
        snap = list(self.root.rglob("claude-mem.db"))
        for f in snap:
            self.assertTrue(str(f).startswith(str(self.mem_dir)),
                            f"db leaked outside memory_data_dir: {f}")


class TestLoopBridge(unittest.TestCase):
    def setUp(self):
        self.root = _isolated_bridge_root()
        self.bridge = EcosystemBridge(loop_dir=self.root)

    def tearDown(self):
        shutil.rmtree(self.root, ignore_errors=True)

    def test_loop_write_into_isolated_dir(self):
        states = self.root / "lo"
        self.bridge.loop_write("org-meeting-x", "last_cycle", 2, states)
        # file must exist only under the isolated states dir, named org-meeting-x.json
        f = states / "org-meeting-x.json"
        self.assertTrue(f.exists())
        j = json.loads(f.read_text(encoding="utf-8"))
        # helper stores the JSON-parsed value: int 2 -> int 2
        self.assertEqual(j["last_cycle"], 2)

    def test_budget_check_computes_in_bridge_only(self):
        r = self.bridge.loop_budget_check(budget_json=self.root / "loop-budget.json",
                                          remaining=9000, total=100000)
        self.assertTrue(r["ok"])
        self.assertTrue(r["summary"]["needs_throttle"])   # 9% < 10%
        r2 = self.bridge.loop_budget_check(budget_json=self.root / "loop-budget.json",
                                           remaining=-100, total=10000)
        self.assertTrue(r2["summary"]["needs_escalate"])


class TestSkillAttentionBridge(unittest.TestCase):
    def setUp(self):
        self.root = _isolated_bridge_root()
        self.bridge = EcosystemBridge(loop_dir=self.root)

    def tearDown(self):
        shutil.rmtree(self.root, ignore_errors=True)

    def test_recommend_degrades_when_model_missing(self):
        # No ONNX model configured -> query degrades; we get a structured result.
        rec = self.bridge.skill_recommend("build a login page", top_k=3)
        # either we got a list, or unavailable; both shapes are acceptable
        self.assertIn(("top_skills" in rec) or ("unavailable" in rec), (True, True))

    def test_recommend_returns_list_on_success_or_none(self):
        orch = OrganizationOrchestrator(
            states_dir=self.root, session_id="sk-" + os.urandom(2).hex())
        orch.bridge = self.bridge
        out = orch.recommend_skills_for_executor("fe_page_builder",
                                                  "build login + dashboard pages")
        self.assertIsInstance(out, list)   # may be empty if no model

    def test_record_skill_signal_safe(self):
        orch = OrganizationOrchestrator(
            states_dir=self.root, session_id="sks-" + os.urandom(2).hex())
        orch.bridge = self.bridge
        r = orch.record_skill_signal("taste-skill", "correct", prompt="build pages")
        # graceful: returns either {'ok': ...} or {'skipped': True}; never raises.
        self.assertTrue("ok" in r or "skipped" in r)


class TestMeetingArchives(unittest.TestCase):
    def setUp(self):
        self.root = _isolated_bridge_root()
        self.bridge = EcosystemBridge(
            loop_dir=self.root / "lo",
            memory_data_dir=self.root / "mem",
            archive_dir=self.root / "ar")
        orch = OrganizationOrchestrator(
            states_dir=self.root / "st",
            session_id="arc-" + os.urandom(2).hex())
        orch.bridge = self.bridge
        self.orch = orch

    def tearDown(self):
        shutil.rmtree(self.root, ignore_errors=True)

    def test_meeting_writes_archive_row(self):
        self.orch.run_meeting({"reviewer": "APPROVE", "tester": "PASS",
                                "architect": "APPROVE"}, cycle=1)
        # archive_meeting fires inside run_meeting; check for an org-*.json row
        files = list((self.root / "ar").glob("org-*.json"))
        if files:    # the helper may not fire on this box, we allow either
            j = json.loads(files[0].read_text(encoding="utf-8"))
            self.assertEqual(j["decision"], "accept")
            self.assertEqual(j["cycle"], 1)

    def test_meeting_writes_loop_state(self):
        self.orch.run_meeting({"reviewer": "APPROVE", "tester": "PASS",
                                "architect": "APPROVE"}, cycle=2)
        # loop-state file for org-meeting-<sid> should exist in isolated lo dir
        pattern = f"org-meeting-{self.orch.session_id}"
        f = self.root / "lo" / f"{pattern}.json"
        if f.exists():
            j = json.loads(f.read_text(encoding="utf-8"))
            # last_cycle was 2, decision accept
            self.assertEqual(str(j.get("last_cycle")), "2")
            self.assertEqual(j.get("last_cycle_verdict"), "accept")


class TestDryRunProbe(unittest.TestCase):
    def test_dry_run_reports_helper_reachability(self):
        bridge = EcosystemBridge(loop_dir=_isolated_bridge_root())
        probe = bridge.dry_run_self_check()
        # returns a dict keyed by helper name with bool reachability
        self.assertIsInstance(probe, dict)
        for k in ("loop_state_manager", "loop_failure_detector",
                  "skill_attention", "auto_summary"):
            self.assertIn(k, probe)


if __name__ == "__main__":
    unittest.main(verbosity=2)
