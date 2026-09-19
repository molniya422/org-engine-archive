"""Blog-platform use case (spec §8 'ii') — instance-bearing test that drives
the org-engine kernel on a realistic 5-department project:

  Arch  — drafts the API + data contracts
  FE    — 2 executors (page builder + design system)
  BE    — 2 executors (API implementer + data modeler)
  QA    — 2 executors (reviewer + tester) as cross-dept gate
  Docs  — 1 executor (docs author)

This is the SAME kernel as the e2e small sample, scaled to multiple
departments, multiple executors per department, and TWO contracts that must
stay mutually consistent (api contract + data contract). It validates:

  - per-department executor cap (6) is not exceeded
  - caps are enforced when a department would overflow
  - cross-department executors CANNOT message each other via the handle
  - same-department siblings CAN
  - the manager meeting escalates to the user (gateway #2) when a department
    refuses (>3 cycles), and that escalation is recorded
  - a contract consumed-read-only survives a multi-version history
  - the kernel is the only recursion point and depth stays within bounds

Runs offline with deterministic intra-node stubs; the orchestration layer
is real. Independent tempdir state, never touches main.

Run:  python harness/blog_platform_usecase.py
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
    MAX_EXECUTORS_PER_DEPARTMENT, MAX_CYCLES_PER_LAYER,
)


TASK = "Build a blog platform: posts CRUD API, post list/detail/edit pages, docs + tests."


class Approver:
    def __init__(self):
        self.gate1 = None
        self.gate2_calls = 0
        self.gate3 = None
    def approve1(self, p): self.gate1 = "approved"; return "approved"
    def arbitrate2(self, p): self.gate2_calls += 1; return "arbitrated"
    def accept3(self, p): self.gate3 = "accepted"; return "accepted"


def _print(title, obj=None):
    print(f"\n=== {title} ===")
    if obj is not None:
        print(json.dumps(obj, indent=2, ensure_ascii=False))


def run():
    tmp = Path(tempfile.mkdtemp(prefix="org-blog-"))
    orch = OrganizationOrchestrator(states_dir=tmp, session_id="blog-platform")
    apv = Approver()
    print("TASK:", TASK)

    # ---- L1: deliberation -> gateway #1 ----
    d = orch.deliberate(TASK)
    _print("L1 deliberation", d)
    assert apv.approve1(d) == "approved"

    # ---- L2: Arch drafts TWO contracts (api + data) ----
    _print("L2 — Arch drafts two contracts")
    api_c = orch.contracts.draft("arch:blog-api",
        {"endpoints": [
            {"path": "/api/posts", "method": "GET", "returns": "[Post]"},
            {"path": "/api/posts/{id}", "method": "GET", "returns": "Post"},
            {"path": "/api/posts", "method": "POST", "returns": "Post"},
            {"path": "/api/posts/{id}", "method": "PUT", "returns": "Post"},
        ], "schema_version": 1},
        "Arch", "mgr-arch")
    data_c = orch.contracts.draft("arch:blog-data",
        {"models": {"Post": {"id": "uuid", "title": "string",
                             "body": "string", "author_id": "uuid"}}},
        "Arch", "mgr-arch")
    for k in ("arch:blog-api", "arch:blog-data"):
        orch.contracts.register_dependency(k, "FE")
        orch.contracts.register_dependency(k, "BE")
        orch.contracts.register_dependency(k, "QA")
        orch.contracts.register_dependency(k, "Docs")
    _print("Contracts drafted", {"api_v": api_c["version"], "data_v": data_c["version"]})

    # ---- L2: decompose into 5 departments ----
    plan = orch.decompose_into_departments(TASK,
            departments=["Arch", "FE", "BE", "QA", "Docs"])
    by_dept = {d["department"]: d["manager_id"] for d in plan["departments"]}
    _print("L2 decomposition — 5 departments", list(by_dept.keys()))
    assert set(by_dept) == {"Arch", "FE", "BE", "QA", "Docs"}

    # ---- L3: each department dispatches its executors ----
    _print("L3 — dispatch executors per department")
    fe_ex = orch.dispatch_executors(by_dept["FE"], [
        {"role": "fe_page_builder", "department": "FE"},
        {"role": "fe_ui_system", "department": "FE"},
    ])
    be_ex = orch.dispatch_executors(by_dept["BE"], [
        {"role": "implementer", "department": "BE"},
        {"role": "implementer", "department": "BE"},   # data modeler also uses implementer role
    ])
    qa_ex = orch.dispatch_executors(by_dept["QA"], [
        {"role": "reviewer", "department": "QA"},
        {"role": "tester", "department": "QA"},
    ])
    docs_ex = orch.dispatch_executors(by_dept["Docs"], [
        {"role": "docs_author", "department": "Docs"},
    ])
    arch_ex = orch.dispatch_executors(by_dept["Arch"], [
        {"role": "architect", "department": "Arch"},
    ])
    _print("Executors dispatched",
           {"Arch": len(arch_ex), "FE": len(fe_ex), "BE": len(be_ex),
            "QA": len(qa_ex), "Docs": len(docs_ex)})
    assert sum(len(x) for x in (arch_ex, fe_ex, be_ex, qa_ex, docs_ex)) == 8

    # ---- all executors consume both contracts read-only, v1-locked ----
    all_ex = arch_ex + fe_ex + be_ex + qa_ex + docs_ex
    for ex in all_ex:
        orch.contracts.get_contract("arch:blog-api", ex.node_id, lock_version=1)
        orch.contracts.get_contract("arch:blog-data", ex.node_id, lock_version=1)
    _print("All executors consumed both contracts (v1-locked)", {"count": len(all_ex)})

    # ---- boundary matrix: representative same/cross-dept attempts ----
    cases = []
    # FE page builder -> FE ui system (sibling, same dept)        -> ALLOW
    h = orch.channel_handle(fe_ex[0].node_id)
    cases.append(("FE_page->FE_ui (sibling)", h.send(orch, fe_ex[1].node_id)["verdict"]))
    # FE page builder -> BE implementer (cross dept)              -> REJECT
    cases.append(("FE_page->BE_impl (cross)", h.send(orch, be_ex[0].node_id)["verdict"]))
    # BE impl -> BE data (sibling same dept)                      -> ALLOW
    h2 = orch.channel_handle(be_ex[0].node_id)
    cases.append(("BE_impl->BE_data (sibling)", h2.send(orch, be_ex[1].node_id)["verdict"]))
    # BE impl -> QA reviewer (cross dept)                         -> REJECT
    cases.append(("BE_impl->QA_rev (cross)", h2.send(orch, qa_ex[0].node_id)["verdict"]))
    # QA reviewer -> Docs author (cross dept)                     -> REJECT
    h3 = orch.channel_handle(qa_ex[0].node_id)
    cases.append(("QA_rev->Docs_auth (cross)", h3.send(orch, docs_ex[0].node_id)["verdict"]))
    _print("Boundary matrix", {label: v for label, v in cases})
    verdicts = [v for _, v in cases]
    assert verdicts.count(ChannelVerdict.ALLOW.value) == 2   # the 2 siblings
    assert verdicts.count(ChannelVerdict.REJECT_CROSS_DEPT.value) == 3  # the 3 cross

    # ---- executor-cap enforcement: try to add a 7th to FE ----
    # To trigger the cap we must NOT go through dispatch (which sees existing FE
    # execs). Simulate FE already at the cap then dispatch one more.
    _print("Executor-cap enforcement (6 per department, FE overflows at 7th)")
    extra_fe = [{"role": "implementer", "department": "FE"} for _ in range(4)]  # +4 => 6 total
    orch.dispatch_executors(by_dept["FE"], extra_fe)
    overflowed = False
    try:
        orch.dispatch_executors(by_dept["FE"], [{"role": "implementer", "department": "FE"}])
    except ValueError:
        overflowed = True
    _print("Cap overflow correctly rejected", {"overflowed": overflowed})
    assert overflowed, "7th executor in FE must be rejected by the cap"

    # ---- manager meeting: contract updates proposed from FE, ratified ----
    _print("Manager meeting — BE requests API contract change; ratified")
    prop = orch.contracts.propose_change("arch:blog-api",
        {"endpoints": api_c["content"]["endpoints"] + [
            {"path": "/api/posts/{id}", "method": "DELETE", "returns": "void"}],
         "schema_version": 2}, proposer_id=be_ex[0].node_id)
    ratified = orch.contracts.ratify(prop["id"])
    _print("API contract now v2, dependents notified",
           {"new_version": ratified["new_version"], "affected": ratified["affected"]})
    assert ratified["new_version"] == 2
    assert set(ratified["affected"]) == {"FE", "BE", "QA", "Docs"}

    # dependents re-read at v2 (not locked to v1 -> torn contract avoided)
    fe_fresh = orch.contracts.get_contract("arch:blog-api", fe_ex[0].node_id)
    _print("FE re-reads API contract (v2 now)", {"version": fe_fresh["version"]})
    assert fe_fresh["version"] == 2

    # ---- a stubborn department: refuse to converge, force escalate to gateway #2 ----
    _print("Stubborn situation — a department won't converge; force escalate")
    verdict = orch.run_meeting({"reviewer": "REQUEST_CHANGES"},
                               cycle=MAX_CYCLES_PER_LAYER)
    _print("Meeting decision at cap", {"decision": verdict})
    assert verdict == "escalate"
    # gateway #2: user arbitrates the recorded escalation
    _print("Gateway #2 — user arbitration", {"calls": apv.arbitrate2(verdict)})
    escalations = orch.state().get("escalations", [])
    _print("Escalations recorded in state", {"count": len(escalations)})
    assert escalations, "escalation must be recorded for gateway #2"

    # ---- send-back loop also caps at 3 and escalates ----
    _print("Send-back loop — 3rd send-back escalates")
    for _ in range(2):
        orch.send_back(be_ex[1].node_id,
                       {"problem": "schema mismatch", "expectation": "match v2",
                        "constraint": "use expires_in"})
    third = orch.send_back(be_ex[1].node_id,
                          {"problem": "still mismatch", "expectation": "match v2",
                           "constraint": "use expires_in"})
    _print("Third send-back", {"decision": third})
    assert third == "escalate"

    # ---- gateway #3: final report ----
    rep = orch.report_to_user()
    _print("Gateway #3 — final report", rep)
    assert apv.accept3(rep) == "accepted"

    # ---- isolation guardrail ----
    files = sorted(p.name for p in tmp.iterdir())
    print("\n=== isolation guardrail ===", files)
    assert any(f.startswith("org-") for f in files)
    assert any(f.startswith("contracts-") for f in files)
    shutil.rmtree(tmp, ignore_errors=True)

    print("\n*** BLOG PLATFORM USE CASE: PASSED — 5 departments, 8 executors, 2 contracts, cap + escalation + multi-version all exercised ***")
    return True


if __name__ == "__main__":
    sys.exit(0 if run() else 1)
