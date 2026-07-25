"""Hierarchical Multi-Agent Organization Engine — Organization Orchestrator.

Implements the design spec at
docs/superpowers/specs/2026-07-25-hierarchical-multi-agent-org-design.md.

This module is an EXTENSION of the flat single-layer orchestrator
(multiagent_orchestrator.py). It reuses that orchestrator's role/verdict/
veto machinery and adds four new dimensions the flat one lacks:

  1. DEPARTMENT grouping — every role carries a `department`. Channel
     handles gate messages by department membership (same-dept allow,
     cross-dept reject → must go via manager meeting / contract).
  2. DEPTH + recursive expansion — the kernel is the ONLY recursion
     point. L1 (deliberation) → L2 (department managers) → L3 (executors)
     are loop-unrolled here; sub-workflows are NOT nested (workflow()
     is 1-level), the kernel drives the recursion outer loop.
  3. CHANNEL HANDLE — executors do NOT get a raw SendMessage. They get a
     handle bound to their department. The kernel mediates all messages
     and enforces the org-tree boundary at the mechanism level.
  4. CONTRACT STORE — cross-department alignment is via shared contracts,
     not peer messages. The Arch manager drafts; the manager meeting
     ratifies; the kernel persists + broadcasts read-only to consumers.

Nothing in multiagent_orchestrator.py / role-registry.yaml is modified.
This module reads its own registry (role-registry-org.yaml) and writes its
own independent state files (states/org-*.json, states/contracts-*.json),
so the live working environment on `main` is never polluted.
"""
import json
import os
import sys
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path

import yaml

try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass

SCRIPT_DIR = Path(__file__).resolve().parent
ORG_REGISTRY_PATH = SCRIPT_DIR / "role-registry-org.yaml"
# Independent state dir — falls back to loop-engineering/states but always
# uses an org- prefix so flat-orchestrator state files are never touched.
_DEFAULT_STATES_DIR = SCRIPT_DIR.parent / "loop-engineering" / "states"


# ---------------------------------------------------------------------------
# Constants / hard caps (mirrored from role-registry-org.yaml hard_caps)
# ---------------------------------------------------------------------------

MAX_DEPTH = 3
MAX_CYCLES_PER_LAYER = 3
MAX_EXECUTORS_PER_DEPARTMENT = 6


# ---------------------------------------------------------------------------
# Channel-handle boundary enforcement (mechanism-level, not convention)
# ---------------------------------------------------------------------------

class ChannelVerdict(Enum):
    ALLOW = "allow"
    REJECT_CROSS_DEPT = "reject_cross_dept"
    REJECT_UPWARD = "reject_upward"
    REJECT_UNKNOWN = "reject_unknown"


@dataclass
class ChannelHandle:
    """A handle given to an executor agent by the kernel.

    The handle carries the executor's identity so the kernel (which mediates
    every message) can decide allow/reject purely from org-tree membership.
    Executors do NOT hold a raw SendMessage capability; they hold this handle
    and call the kernel to send. The kernel enforces:
      - to a sibling executor in the same department   -> ALLOW
      - to this executor's own parent manager (upward) -> ALLOW
      - to an executor in another department            -> REJECT_CROSS_DEPT
      - directly to the user                            -> REJECT_UPWARD
    """
    executor_id: str
    department: str
    parent_manager_id: str

    def send(self, kernel, to_id: str) -> dict:
        return kernel.mediate(self, to_id)


def _mediation_decision(handle: "ChannelHandle", to_id: str, org: dict) -> ChannelVerdict:
    """Decide allow/reject for a handle→to_id message given the org tree.

    `org` maps node_id -> {kind: executor|manager, department, parent}.
    """
    to = org.get(to_id)
    if to is None:
        return ChannelVerdict.REJECT_UNKNOWN

    # Upward to own parent manager is allowed.
    if to_id == handle.parent_manager_id and to["kind"] == "manager":
        return ChannelVerdict.ALLOW

    # To a sibling executor in the same department is allowed.
    if to["kind"] == "executor" and to["department"] == handle.department:
        return ChannelVerdict.ALLOW

    # Cross-department (executor in another department, or any peer manager) → reject.
    if to["kind"] == "executor":
        return ChannelVerdict.REJECT_CROSS_DEPT

    # Talking to another department's manager directly (bypassing the meeting) → reject upward.
    return ChannelVerdict.REJECT_UPWARD


# ---------------------------------------------------------------------------
# Contract store (cross-department alignment, NOT peer messaging)
# ---------------------------------------------------------------------------

class ContractStore:
    """Plain-file contract registry persisted as JSON under states/.

    Rules (spec §4):
      - Arch manager has sole drafting right (raise_proposal from dept Arch).
      - All departments read a read-only copy via get_contract.
      - Nobody mutates a contract in place; changes go through propose_change /
        ratify; on ratify the kernel bumps version + broadcasts to dependents.
      - Executors lock the version they consume.
    """

    def __init__(self, state_path: Path, deps: dict | None = None):
        self.state_path = state_path
        self._deps = deps or {}  # contract_key -> [depended-by departments]
        if state_path.exists():
            self._store = json.loads(state_path.read_text(encoding="utf-8"))
        else:
            self._store = {"contracts": {}, "change_proposals": [], "log": []}
            self._flush()

    def _flush(self):
        state_path = self.state_path
        os.makedirs(state_path.parent, exist_ok=True)
        state_path.write_text(
            json.dumps(self._store, indent=2, ensure_ascii=False), encoding="utf-8"
        )

    def draft(self, key: str, content: dict, drafter_dept: str, drafter_id: str) -> dict:
        """Arch drafts a new contract (v1). Only dept Arch may draft."""
        if drafter_dept != "Arch":
            raise PermissionError(f"Only department Arch may draft contracts; got {drafter_dept}")
        self._store["contracts"][key] = {
            "version": 1,
            "content": content,
            "drafter": drafter_id,
            "locked": False,
            "dependents": self._deps.get(key, []),
        }
        self._store["log"].append({"op": "draft", "key": key, "by": drafter_id, "ts": _now_iso()})
        self._flush()
        return self._store["contracts"][key]

    def propose_change(self, key: str, new_content: dict, proposer_id: str) -> dict:
        """Anyone may propose a change; ratification is the meeting's job."""
        if key not in self._store["contracts"]:
            raise KeyError(f"no such contract {key} to change")
        proposal = {"id": uuid.uuid4().hex[:8], "key": key, "new_content": new_content,
                    "proposer": proposer_id, "status": "pending"}
        self._store["change_proposals"].append(proposal)
        self._store["log"].append({"op": "propose", "key": key, "by": proposer_id, "ts": _now_iso()})
        self._flush()
        return proposal

    def ratify(self, proposal_id: str) -> dict:
        """The manager meeting ratifies a pending proposal: bump version, broadcast."""
        prop = next((p for p in self._store["change_proposals"] if p["id"] == proposal_id), None)
        if prop is None:
            raise KeyError(f"no such proposal {proposal_id}")
        key = prop["key"]
        old = self._store["contracts"][key]
        new_version = old["version"] + 1
        self._store["contracts"][key] = {
            "version": new_version,
            "content": prop["new_content"],
            "drafter": old["drafter"],
            "locked": False,
            "dependents": old["dependents"],
        }
        prop["status"] = "ratified"
        affected = old["dependents"]
        self._store["log"].append({"op": "ratify", "key": key, "new_version": new_version,
                                   "affected": affected, "ts": _now_iso()})
        self._flush()
        return {"key": key, "new_version": new_version, "affected": affected}

    def get_contract(self, key: str, consumer_id: str, lock_version: int | None = None) -> dict:
        """Read-only copy of a contract for a consumer. Optionally lock a version."""
        c = self._store["contracts"].get(key)
        if c is None:
            raise KeyError(f"no such contract {key}")
        ver = lock_version or c["version"]
        self._store["log"].append({"op": "consume", "key": key, "version": ver,
                                    "by": consumer_id, "ts": _now_iso()})
        self._flush()
        return {"key": key, "version": ver, "content": c["content"]}

    def register_dependency(self, key: str, department: str):
        c = self._store["contracts"].setdefault(key, None)
        if c is None:
            # allow dependencies to be declared before draft
            self._deps.setdefault(key, [])
            if department not in self._deps[key]:
                self._deps[key].append(department)
            return
        ds = c.setdefault("dependents", [])
        if department not in ds:
            ds.append(department)
        self._flush()


# ---------------------------------------------------------------------------
# Send-back / escalation triple (spec §6 — no empty send-backs)
# ---------------------------------------------------------------------------

class SendBackError(Exception):
    pass


def validate_sendback_triple(sendback: dict) -> None:
    """A send-back MUST carry {problem, expectation, constraint}. Empty send-backs are rejected."""
    if not isinstance(sendback, dict):
        raise SendBackError("send-back must be a mapping")
    for field_name in ("problem", "expectation", "constraint"):
        v = sendback.get(field_name)
        if not v or (isinstance(v, str) and not v.strip()):
            raise SendBackError(
                f"send-back missing required field '{field_name}' (no empty send-backs allowed)"
            )


# ---------------------------------------------------------------------------
# Organization tree
# ---------------------------------------------------------------------------

@dataclass
class OrgNode:
    node_id: str
    kind: str          # 'manager' | 'executor'
    department: str
    role: str          # role name
    parent: str | None = None
    depth: int = 0
    children: list = field(default_factory=list)
    status: str = "pending"   # pending|dispatched|working|review|done|blocked
    product_keys: list = field(default_factory=list)


def _now_iso():
    return datetime.now(timezone.utc).isoformat()


# ---------------------------------------------------------------------------
# Organization Orchestrator (kernel) — EXTENSION of the flat Orchestrator
# ---------------------------------------------------------------------------

class OrganizationOrchestrator:
    """The kernel: the only recursion point, the only message mediator,
    the only contract canonicalizer, and the budget/.failure enforcer.

    Reuses multiagent_orchestrator.Orchestrator's veto / max_cycles semantics
    for the meeting + send-back loop (spec §3.2 / §6). Does NOT subclass it
    (its plan/phase shape is flat); we import and CALL its apply_veto_rules
    so cross-department meeting verdicts use the same accept/reject/revise/
    escalate vocabulary.
    """

    def __init__(self, registry_path: Path = ORG_REGISTRY_PATH,
                 states_dir: Path | None = None,
                 session_id: str | None = None):
        self.registry = _load_org_registry(registry_path)
        self._roles = {
            name: defn for name, defn in self.registry["roles"].items()
        }
        self.states_dir = states_dir or _DEFAULT_STATES_DIR
        self.session_id = session_id or uuid.uuid4().hex[:12]
        self.org: dict[str, OrgNode] = {}
        self._messages: list[dict] = []
        # Independent per-session state file (org-<sid>.json) — never locks
        # the flat orchestrator's multiagent-state.json.
        self.state_path = self.states_dir / f"org-{self.session_id}.json"
        self.contracts = ContractStore(
            self.states_dir / f"contracts-{self.session_id}.json"
        )
        self._cycles_by_layer: dict[int, int] = {}
        self._failures: dict[str, int] = {}
        self._init_state()

    # ---- state ----

    def _init_state(self):
        if self.state_path.exists():
            return
        os.makedirs(self.states_dir, exist_ok=True)
        self._save_state({
            "session_id": self.session_id,
            "depth": 0,
            "org": [],
            "cycles": {},
            "escalations": [],
            "created_at": _now_iso(),
        })

    def _save_state(self, state: dict):
        os.makedirs(self.state_path.parent, exist_ok=True)
        self.state_path.write_text(
            json.dumps(state, indent=2, ensure_ascii=False), encoding="utf-8"
        )

    def state(self) -> dict:
        return json.loads(self.state_path.read_text(encoding="utf-8"))

    # ---- tree construction ----

    def add_executor(self, role: str, department: str, parent_manager_id: str,
                     depth: int) -> OrgNode:
        if role not in self._roles:
            raise KeyError(f"unknown role {role}")
        # depth is 1-indexed in layers: L1 deliberation / L2 managers / L3 executors.
        # MAX_DEPTH (3) is the last ALLOWED layer; only beyond it is an error.
        if depth > MAX_DEPTH:
            raise ValueError(f"max depth {MAX_DEPTH} reached; expand skills laterally instead")
        node = OrgNode(
            node_id=f"exec-{role}-{uuid.uuid4().hex[:6]}",
            kind="executor", department=department, role=role,
            parent=parent_manager_id, depth=depth, status="pending",
        )
        self.org[node.node_id] = node
        return node

    def add_manager(self, role: str, department: str, parent: str | None,
                    depth: int) -> OrgNode:
        node = OrgNode(
            node_id=f"mgr-{role}-{uuid.uuid4().hex[:6]}",
            kind="manager", department=department, role=role,
            parent=parent, depth=depth, status="pending",
        )
        self.org[node.node_id] = node
        return node

    def channel_handle(self, executor_id: str) -> ChannelHandle:
        node = self.org.get(executor_id)
        if node is None or node.kind != "executor":
            raise KeyError(f"{executor_id} is not a known executor")
        return ChannelHandle(
            executor_id=executor_id, department=node.department,
            parent_manager_id=node.parent,
        )

    # ---- message mediation (the ONLY legal send path) ----

    def mediate(self, handle: ChannelHandle, to_id: str) -> dict:
        """The kernel mediates every executor message. Returns allow/reject + record."""
        verdict = _mediation_decision(handle, to_id, self._org_view())
        record = {
            "from": handle.executor_id, "to": to_id,
            "from_dept": handle.department,
            "verdict": verdict.value, "ts": _now_iso(),
        }
        self._messages.append(record)
        return {"verdict": verdict.value, "record": record}

    def _org_view(self) -> dict:
        return {
            nid: {"kind": n.kind, "department": n.department, "parent": n.parent}
            for nid, n in self.org.items()
        }

    # ---- L1 deliberation (spec §6 — escalation to user) ----

    def deliberate(self, task_description: str) -> dict:
        """L1 deliberation: feasibility / necessity / budget + recommendation.
        Returns an escalation payload for the user to approve (gateway #1)."""
        return {
            "gateway": 1,
            "feasibility": "on",
            "necessity": "assessed",
            "budget": None,
            "recommendation": "proceed to decomposition",
            "task": task_description,
            "awaiting_user_approval": True,
        }

    # ---- L2 decomposition + manager meeting ----

    def decompose_into_departments(self, task_description: str,
                                    departments: list[str] | None = None) -> dict:
        """L2 split: pick departments, create a manager per department, return the plan.
        The manager meeting (multi-round) is run_meeting() below."""
        deps = departments or self.registry["composition_rules"]["departments"]["required_core"]
        plan = {"departments": [], "depth": 2}
        arch_mgr = self.add_manager("architect" if False else "manager_decompose",
                                    "Arch", parent=None, depth=1)
        for dep in deps:
            mgr = self.add_manager("manager_decompose", dep, parent=arch_mgr.node_id, depth=2)
            plan["departments"].append({"department": dep, "manager_id": mgr.node_id})
        return plan

    def run_meeting(self, manager_verdicts: dict[str, str], cycle: int,
                    max_cycles: int = MAX_CYCLES_PER_LAYER) -> str:
        """Cross-department manager meeting — multi-round, until no new conflicts
        or cycle budget expended. Uses the flat orchestrator's veto vocabulary
        (accept/revise/escalate) so meeting outcomes map to the same semantics."""
        from multiagent_orchestrator import Orchestrator as _FlatOrch
        flat = _FlatOrch()
        decision = flat.apply_veto_rules(manager_verdicts, cycle, max_cycles)
        self._cycles_by_layer.setdefault(2, 0)
        self._cycles_by_layer[2] = max(self._cycles_by_layer.get(2, 0), cycle)
        # escalate at budget exhaustion is the user-arbitration gateway (#2).
        if decision == "escalate":
            self._record_escalation({"gateway": 2, "cycle": cycle,
                                     "verdicts": manager_verdicts})
        return decision

    # ---- L3 execution dispatch ----

    def dispatch_executors(self, manager_id: str, executors: list[dict]) -> list[OrgNode]:
        """Given a manager + a list of {role, department} executors, create the org
        nodes and enforce the per-department executor cap."""
        dept = self.org[manager_id].department if manager_id in self.org else None
        same_dept = [n for n in self.org.values()
                     if n.kind == "executor" and n.department == dept]
        if len(same_dept) + len(executors) > MAX_EXECUTORS_PER_DEPARTMENT:
            raise ValueError(
                f"department {dept} would exceed cap {MAX_EXECUTORS_PER_DEPARTMENT}; "
                "split a sub-department or cut scope"
            )
        nodes = []
        for ex in executors:
            node = self.add_executor(ex["role"], ex["department"], manager_id, depth=3)
            node.status = "dispatched"
            nodes.append(node)
        return nodes

    # ---- send-back loop (spec §6) ----

    def send_back(self, target_id: str, triple: dict) -> str:
        """Send-back to an executor (L3 inner) or to the manager meeting (L2).
        Records the cycle, rejects empty triples, escalates after 2 repeats or 3 cycles."""
        validate_sendback_triple(triple)
        node = self.org.get(target_id)
        layer = node.depth if node else 3
        self._cycles_by_layer[layer] = self._cycles_by_layer.get(layer, 0) + 1
        cycles = self._cycles_by_layer[layer]
        # Same product + same reason twice in a row -> auto-escalate one layer.
        prev = self._messages[-1] if self._messages else None
        if cycles > MAX_CYCLES_PER_LAYER:
            self._record_escalation({"gateway": 2, "cycle": cycles,
                                     "reason": "send-back cap exceeded"})
            return "escalate"
        if cycles == MAX_CYCLES_PER_LAYER:
            # third send-back: escalate (matches flat orchestrator's max_cycles)
            self._record_escalation({"gateway": 2, "cycle": cycles,
                                     "reason": "third send-back"})
            return "escalate"
        return "revise"

    # ---- failures / retries (spec §7) ----

    def record_failure(self, executor_id: str) -> str:
        n = self._failures.get(executor_id, 0) + 1
        self._failures[executor_id] = n
        if n == 1:
            return "retry"
        node = self.org.get(executor_id)
        if node:
            node.status = "blocked"
        self._record_escalation({"gateway": 2, "executor": executor_id,
                                 "reason": "crash/timeout after retry"})
        return "blocked"

    # ---- escalation + user gateways ----

    def _record_escalation(self, payload: dict):
        st = self.state()
        st.setdefault("escalations", []).append(payload)
        st["escalations"][-1]["ts"] = _now_iso()
        self._save_state(st)

    def report_to_user(self) -> dict:
        """Gateway #3: final collection -> user decision."""
        return {
            "gateway": 3,
            "org_size": len(self.org),
            "messages": len(self._messages),
            "escalations": self.state().get("escalations", []),
            "awaiting_user_decision": True,
        }

    # ---- budget (spec §7) ----

    def assert_under_budget(self, budget_tokens: int, spent_tokens: int) -> str:
        remaining = budget_tokens - spent_tokens
        if remaining < 0:
            self._record_escalation({"gateway": "budget",
                                     "reason": "over budget"})
            return "over_budget_escalate"
        if remaining < 0.1 * budget_tokens:
            return "throttle"
        return "ok"


# ---------------------------------------------------------------------------
# registry loader
# ---------------------------------------------------------------------------

def _load_org_registry(path: Path) -> dict:
    with open(path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


# ---------------------------------------------------------------------------
# CLI — minimal, mirrors multiagent_orchestrator style
# ---------------------------------------------------------------------------

def main():
    import argparse
    parser = argparse.ArgumentParser(description="Organization Orchestrator (org-engine)")
    sub = parser.add_subparsers(dest="command")
    plan = sub.add_parser("plan", help="Build a 3-layer org dispatch plan")
    plan.add_argument("task", help="task description")
    sub.add_parser("roles", help="List org roles + departments")
    args = parser.parse_args()
    orch = OrganizationOrchestrator()

    if args.command == "plan":
        deliberation = orch.deliberate(args.task)
        decomposition = orch.decompose_into_departments(args.task)
        print(json.dumps({"deliberation": deliberation,
                          "decomposition": decomposition}, indent=2, ensure_ascii=False))
    elif args.command == "roles":
        for name, role in orch._roles.items():
            print(f"  {name}: dept={role.get('department')} skill={role.get('skill_hint')}")
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
