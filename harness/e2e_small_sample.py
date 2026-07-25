"""End-to-end small sample — the org-engine kernel DRIVES a real 2-dept / 2-executor
task through L1→L2→L3→collection→3-user-gateways, exercising the actual API
(not mocked). This is the "small sample" load-bearing walk specified in
spec §8 (point 4): prove the skeleton on a tiny task (2 pages static site +
1 API stub) before large projects.

It runs WITHOUT real LLM subagents (the kernel is the orchestration layer, not
the model); each executor/manager step is represented by a deterministic local
"agent stub" so the walk is reproducible, fast, and offline. The CONTRACT is
the real ContractStore; the CHANNEL HANDLE is the real boundary; the RECURSION
+ cycles + escalations are the real kernel logic. Only the "thinking" inside a
node is stubbed, because that's an LLM concern layered on TOP of this engine.

The 3 user gateways are represented as in-process callbacks (we simulate the
human approver) so the walk completes end-to-end deterministically.

Run:  python harness/e2e_small_sample.py
"""
import json
import os
import shutil
import sys
import tempfile
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))
import organization_orchestrator as oo
from organization_orchestrator import (
    OrganizationOrchestrator, ChannelVerdict,
)


# --- task ---
TASK = "Build a 2-page static site (login + dashboard) and one API stub (/api/login -> token)."

# Departments for the small sample: keep it minimal — FE + BE + (Arch as contract drafter).
DEPARTMENTS = ["Arch", "FE", "BE"]


# --- human-approver simulation for the 3 gateways ---
class Approver:
    """Stands in for the user (the 董事长) at the 3 gateways."""
    def __init__(self):
        self.gate1_approved = False   # after L1 deliberation
        self.gate2_arbitrations = 0    # when a meeting exceeds cycle budget
        self.gate3_final_decision = None

    def gate1(self, payload):
        self.gate1_approved = True
        return "approved"

    def gate2(self, payload):
        self.gate2_arbitrations += 1
        return "arbitrated"

    def gate3(self, payload):
        self.gate3_final_decision = "accepted"
        return "accepted"


def _print(title, obj=None):
    print(f"\n=== {title} ===")
    if obj is not None:
        print(json.dumps(obj, indent=2, ensure_ascii=False))


def run():
    tmp = Path(tempfile.mkdtemp(prefix="org-e2e-"))
    orch = OrganizationOrchestrator(states_dir=tmp, session_id="e2e-small")
    approver = Approver()

    print("TASK:", TASK)
    _print("Phase 0 — kernel initialized", {"session_id": orch.session_id,
           "state_file": orch.state_path.name,
           "contracts_file": orch.contracts.state_path.name})

    # ----- L1: deliberation -> Gateway #1 -----
    deliberation = orch.deliberate(TASK)
    _print("L1 deliberation (feasibility/necessity/budget/recommendation)", deliberation)
    g1 = approver.gate1(deliberation)
    _print("Gateway #1 — user approval", {"verdict": g1})
    assert g1 == "approved", "task cannot proceed without user approval at gateway 1"

    # ----- L2: Arch drafts the contract (cross-dept alignment substrate) -----
    _print("L2 — Arch manager drafts contract arch:blog-api")
    contract = orch.contracts.draft(
        key="arch:blog-api",
        content={"endpoints": [{"path": "/api/login", "method": "POST",
                                 "returns": {"token": "<string>"}}],
                 "schema_version": 1},
        drafter_dept="Arch", drafter_id="mgr-arch",
    )
    orch.contracts.register_dependency("arch:blog-api", "FE")
    orch.contracts.register_dependency("arch:blog-api", "BE")
    _print("Contract v1 drafted", {"key": "arch:blog-api", "version": contract["version"]})

    # ----- L2: decompose into departments (managers created) -----
    plan = orch.decompose_into_departments(TASK, departments=DEPARTMENTS)
    _print("L2 decomposition (department managers) — depth 2", plan)

    # FE manager and BE manager are the two real departments here.
    fe_mgr = next(d for d in plan["departments"] if d["department"] == "FE")["manager_id"]
    be_mgr = next(d for d in plan["departments"] if d["department"] == "BE")["manager_id"]

    # ----- L3: dispatch executors (1 per dept for the small sample) -----
    _print("L3 — departments dispatch executors")
    fe_execs = orch.dispatch_executors(fe_mgr, [{"role": "fe_page_builder", "department": "FE"}])
    be_execs = orch.dispatch_executors(be_mgr, [{"role": "implementer", "department": "BE"}])

    # ----- executors consume the contract (read-only, version-locked) -----
    fe_consumer = orch.contracts.get_contract("arch:blog-api", fe_execs[0].node_id, lock_version=1)
    be_consumer = orch.contracts.get_contract("arch:blog-api", be_execs[0].node_id, lock_version=1)
    _print("Executors consumed contract (read-only, v1-locked)",
           {"fe": fe_consumer["key"], "be": be_consumer["key"],
            "fe_sees": fe_consumer["content"]["endpoints"][0]["path"]})
    assert fe_consumer["content"] == be_consumer["content"], "both executors read the same contract"

    # ----- boundary enforcement: FE executor tries cross-dept + sibling -----
    h_fe = orch.channel_handle(fe_execs[0].node_id)
    r1 = h_fe.send(orch, be_execs[0].node_id)        # cross-dept -> REJECT
    r2 = h_fe.send(orch, fe_mgr)                     # upward to own manager -> ALLOW
    _print("Boundary enforcement during execution",
           {"fe->be_cross_dept": r1["verdict"], "fe->own_mgr_upward": r2["verdict"]})
    assert r1["verdict"] == ChannelVerdict.REJECT_CROSS_DEPT.value
    assert r2["verdict"] == ChannelVerdict.ALLOW.value

    # ----- each executor "produces" a product (stub; real impl is the LLM's job) -----
    fe_execs[0].product_keys = ["fe:pages-login", "fe:pages-dashboard"]
    be_execs[0].product_keys = ["be:api-login-stub"]
    _print("Executors produced", {"fe": fe_execs[0].product_keys, "be": be_execs[0].product_keys})

    # ----- L2 manager meeting: verify contract consistency (accept on first try) -----
    meeting = orch.run_meeting({"reviewer": "APPROVE", "tester": "PASS",
                                "architect": "APPROVE"}, cycle=1)
    _print("L2 manager meeting (contract consistency)", {"decision": meeting})
    assert meeting == "accept", "small sample should converge on first meeting round"

    # ----- mid-flight contract change requested by FE, ratified by meeting -----
    prop = orch.contracts.propose_change("arch:blog-api",
                                         {"endpoints": [{"path": "/api/login", "method": "POST",
                                                         "returns": {"token": "<string>",
                                                                     "expires_in": 3600}}],
                                          "schema_version": 2}, proposer_id=fe_mgr)
    ratified = orch.contracts.ratify(prop["id"])
    _print("Contract change ratified mid-flight", ratified)

    # ----- BE consumer now sees v2 (was locked to v1 — must NOT be torn) -----
    be_fresh = orch.contracts.get_contract("arch:blog-api", be_execs[0].node_id)
    _print("BE re-reads contract after ratify (v2)", {"version": be_fresh["version"],
           "expires_in_present": "expires_in" in be_fresh["content"]["endpoints"][0]["returns"]})

    # ----- Gateway #3: final report to user -----
    rep = orch.report_to_user()
    _print("Gateway #3 — final report to user", rep)
    g3 = approver.gate3(rep)
    _print("User final decision", {"verdict": g3})
    assert g3 == "accepted"

    # ----- failures & budget sanity (touch those code paths too) -----
    assert orch.record_failure(fe_execs[0].node_id) == "retry"     # first failure -> retry
    assert orch.record_failure(fe_execs[0].node_id) == "blocked"   # second -> blocked
    assert orch.assert_under_budget(budget_tokens=100_000, spent_tokens=20_000) == "ok"

    # ----- isolation guardrail: org-* / contracts-* files are separate -----
    files = sorted(p.name for p in tmp.iterdir())
    print("\n=== isolation guardrail ===")
    print("isolation files:", files)
    assert any(f.startswith("org-") for f in files)
    assert any(f.startswith("contracts-") for f in files)

    # cleanup
    shutil.rmtree(tmp, ignore_errors=True)

    print("\n*** E2E SMALL SAMPLE: PASSED — skeleton walks L1→L2→L3→collection→3-gateways end to end ***")
    return True


if __name__ == "__main__":
    ok = run()
    sys.exit(0 if ok else 1)
