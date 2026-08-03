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

# Bridge import is lazy to avoid a hard dep on the helper module existing.
try:
    from org_ecosystem_bridge import EcosystemBridge
except Exception:  # pragma: no cover - guarantees import-time resilience
    EcosystemBridge = None

# Skill loader — loads real skill files from disk for prompt injection + evidence validation.
try:
    from org_skill_loader import (inject_into_prompt, validate_evidence,
                                   list_available_skills, get_skill_content)
    _SKILL_LOADER_AVAILABLE = True
except Exception:
    inject_into_prompt = lambda n, b: b
    validate_evidence = lambda n, e: {"valid": None, "reason": "loader unavailable"}
    list_available_skills = lambda: {}
    get_skill_content = lambda n: None
    _SKILL_LOADER_AVAILABLE = False


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


# Workflow-config v2 explicit communication rules.
# Populated by OrganizationOrchestrator.configure_workflow(). Explicit rules
# override the org-tree default isolation (same-dept / upward allow, else reject).
_WF_MESSAGE_EDGES: set = set()      # {(sender_node_id, recipient_node_id)}
_WF_CHANNEL_ACL: dict = {}          # {channel_key: {'read': [...], 'write': [...]}}
_WF_NODE_CHANNEL: dict = {}         # {node_id: channel_key}


def set_workflow_message_edges(edges: set) -> None:
    global _WF_MESSAGE_EDGES
    _WF_MESSAGE_EDGES = edges


def set_workflow_channels(acl: dict, node_channel: dict) -> None:
    global _WF_CHANNEL_ACL, _WF_NODE_CHANNEL
    _WF_CHANNEL_ACL, _WF_NODE_CHANNEL = acl, node_channel


def _mediation_decision(handle: "ChannelHandle", to_id: str, org: dict) -> ChannelVerdict:
    """Decide allow/reject for a handle→to_id message given the org tree.

    `org` maps node_id -> {kind: executor|manager, department, parent}.
    """
    # 1) 显式 message 边：命中即 ALLOW（可放宽为跨部门点对点）
    if (handle.executor_id, to_id) in _WF_MESSAGE_EDGES:
        return ChannelVerdict.ALLOW
    # 2) 显式 channel：双方挂同一频道且接收方在频道读/写授权内 → ALLOW
    ch = _WF_NODE_CHANNEL.get(handle.executor_id)
    if ch and _WF_NODE_CHANNEL.get(to_id) == ch:
        acl = _WF_CHANNEL_ACL.get(ch, {})
        if to_id in acl.get('read', []) or to_id in acl.get('write', []):
            return ChannelVerdict.ALLOW
    # 3) 默认回落：现有组织树隔离
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
        if hasattr(self, '_orch_log'):
            self._orch_log('contract_draft', drafter_id, {'key': key, 'version': 1, 'content_keys': list(content.keys())})
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
        if hasattr(self, '_orch_log'):
            self._orch_log('contract_ratify', 'kernel', {'key': key, 'new_version': new_version, 'affected': affected})
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

# ---------------------------------------------------------------------------
# Accountability + skill-manifest (追责制 + skill 强制化)
# ---------------------------------------------------------------------------

@dataclass
class SkillManifest:
    """Evidence that an executor actually invoked its bound skill.

    The kernel cannot intercept the raw agent() call Workflow makes (it is not
    in that call chain). So enforcement is at the GATE: a product key is only
    issued when the manifest's `skill_used` equals the executor's bound skill
    AND `evidence` is non-empty (proof the skill was read/used). Without a
    compliant manifest, audit_accountability() rejects and the product is
    treated as not-done. This is mechanism-level (拒绝签发), not a runtime
    intercept and not a prompt 'SHOULD'.
    """
    skill_used: str
    evidence: str          # proof: skill file path / ref applied, or what the skill mandated
    product_ref: str       # the artifact this manifest vouches for

    def is_compliant(self, bound_skill: str | None) -> bool:
        if not bound_skill:
            return False
        if self.skill_used != bound_skill:
            return False
        if not self.evidence or not self.evidence.strip():
            return False
        return True


@dataclass
class Accountability:
    """追责条目:每个节点向上汇报时必须带'我干了什么/怎么干的/依据什么'.

    链式溯源(delegated_to / delegated_by)让从顶向下的追责成为一次 DFS:
    项目 -> 主管 -> 执行者, 沿链可钻到具体某执行者的 did/how/evidence.
    """
    did: str               # 干了什么 (具体产出/操作)
    how: str               # 怎么做的 (依据哪条契约/哪个子节点/哪个skill)
    evidence: str = ""     # 可核验依据 (产物key/日志引用/skill manifest)
    delegated_to: list = field(default_factory=list)   # 下游节点id, 向下追责链
    delegated_by: str | None = None                    # 上游节点id, 溯源链
    skill_manifest: SkillManifest | None = None        # 执行者专属: skill强制凭证
    audit_status: str = "pending"   # pending|approved|rejected
    audit_reason: str = ""

    def to_dict(self) -> dict:
        m = None
        if self.skill_manifest is not None:
            m = {"skill_used": self.skill_manifest.skill_used,
                 "evidence": self.skill_manifest.evidence,
                 "product_ref": self.skill_manifest.product_ref}
        return {"did": self.did, "how": self.how, "evidence": self.evidence,
                "delegated_to": self.delegated_to, "delegated_by": self.delegated_by,
                "skill_manifest": m, "audit_status": self.audit_status,
                "audit_reason": self.audit_reason}


class AuditError(Exception):
    """Raised when an accountability record fails the pre-report audit."""


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
    bound_skill: str | None = None           # 该执行者/主管绑定skill (强制对象)
    accountability: Accountability | None = None   # 追责条目


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
        self.contracts._orch_log = self.log_event
        self._cycles_by_layer: dict[int, int] = {}
        self._failures: dict[str, int] = {}
        # Optional bridge to loop-engineering + skill-attention + auto-summary+memory.
        # If None (or helpers missing), the bridge methods degrade silently.
        self.bridge = EcosystemBridge() if EcosystemBridge else None
        # Audit log: every subagent call, skill use, meeting, and audit decision
        # gets a stamped entry. Feed for the summary report at the end.
        self.audit_log: list[dict] = []
        # workflow-config v2 meetings configured via configure_workflow()
        self._meetings: list = []
        self._init_state()

    # ---- audit log: 每条事件都带时间戳 + actor + event_type + details ----

    def log_event(self, event_type: str, actor: str, details: dict,
                  target: str | None = None, result: str | None = None):
        """写给总结报告的审计日志。每条是(time, type, who, what, target, outcome)。"""
        self.audit_log.append({
            "ts": _now_iso(),
            "event_type": event_type,
            "actor": actor,
            "target": target,
            "result": result,
            "details": details,
        })

    def generate_summary_report(self) -> dict:
        """从 audit_log 汇总出可读的总结报告: 用了几次subagent,哪些skills,
        开了哪些会, 审计了什么内容, 等统计."""
        ls = self.audit_log
        mgr_count = [e for e in ls if e["event_type"] == "manager_created"]
        exe_count = [e for e in ls if e["event_type"] == "executor_created"]
        meeting_count = [e for e in ls if e["event_type"] == "meeting"]
        audit_events = [e for e in ls if e["event_type"] == "audit"]
        skill_rec = [e for e in ls if e["event_type"] == "skill_recommend"]
        sk_used = set()
        for e in ls:
            sk = e.get("details", {}).get("skill_used")
            if sk:
                sk_used.add(sk)
            sk2 = e.get("details", {}).get("skill")
            if sk2:
                sk_used.add(sk2)
        # 聚合 meeting 会议表
        meetings = []
        for m in meeting_count:
            d = m["details"]
            meetings.append({
                "cycle": d.get("cycle"), "decision": d.get("decision"),
                "time": m["ts"],
            })
        # 聚合审计表
        audits = []
        for a in audit_events:
            d = a["details"]
            audits.append({
                "node": a["actor"], "result": a["result"],
                "reason": d.get("reason", ""),
                "time": a["ts"],
            })
        return {
            "session_id": self.session_id,
            "total_events": len(ls),
            "timeline": ls,
            "summary_stats": {
                "managers_created": len(mgr_count),
                "executors_created": len(exe_count),
                "meetings_held": len(meeting_count),
                "audits_performed": len(audit_events),
                "skills_used": sorted(sk_used),
                "skill_recommendations": len(skill_rec),
                "total_send_backs": len([e for e in ls
                                          if e["event_type"] == "send_back"]),
                "failures_recorded": len([e for e in ls
                                           if e["event_type"] == "failure"]),
                "product_keys_issued": len([e for e in ls
                                             if e["event_type"] == "product_key"]),
            },
            "meeting_log": meetings,
            "audit_log": audits,
        }

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
        # 绑定skill来自registry,是亲测强制化的对象(不是建议)
        node.bound_skill = self._roles[role].get("skill_hint")
        self.org[node.node_id] = node
        self.log_event("executor_created", node.node_id, {"role": role, "department": department, "bound_skill": node.bound_skill})
        return node

    def add_manager(self, role: str, department: str, parent: str | None,
                    depth: int) -> OrgNode:
        node = OrgNode(
            node_id=f"mgr-{role}-{uuid.uuid4().hex[:6]}",
            kind="manager", department=department, role=role,
            parent=parent, depth=depth, status="pending",
        )
        node.bound_skill = self._roles[role].get("skill_hint")
        self.org[node.node_id] = node
        self.log_event("manager_created", node.node_id, {"role": role, "department": department, "bound_skill": node.bound_skill})
        return node

    def channel_handle(self, executor_id: str) -> ChannelHandle:
        node = self.org.get(executor_id)
        if node is None or node.kind != "executor":
            raise KeyError(f"{executor_id} is not a known executor")
        return ChannelHandle(
            executor_id=executor_id, department=node.department,
            parent_manager_id=node.parent,
        )

    # ---- accountability / 追责制 / skill 强制 ----

    def record_accountability(self, node_id: str, did: str, how: str,
                              evidence: str = "",
                              skill_manifest: SkillManifest | None = None) -> Accountability:
        """节点向上汇报前,先写自己的责任条目(did/how/evidence + skill凭证).

        链式指针在 set_delegation / collect 子方法里补齐, 这里只立条目。
        汇报前的逐层审查由 audit_accountability() 做, 没过审不给签发产物。
        """
        node = self.org.get(node_id)
        if node is None:
            raise KeyError(f"no node {node_id}")
        old = node.accountability
        # 保留已有的链指针(set_delegation建的 delegated_to / delegated_by),
        # 否则后续 record 把链指针擦掉, 顶向下追责断链。
        acc = Accountability(
            did=did, how=how, evidence=evidence,
            delegated_by=(old.delegated_by if old else node.parent),
            delegated_to=(old.delegated_to if old else []),
            skill_manifest=skill_manifest,
        )
        node.accountability = acc
        self.log_event("skill_used", node.node_id,
                       {"skill": skill_manifest.skill_used if skill_manifest else None,
                        "bound_skill": node.bound_skill,
                        "evidence_len": len(skill_manifest.evidence) if skill_manifest else 0,
                        "did": did[:60]})
        return acc

    def set_delegation(self, manager_id: str, child_ids: list[str]):
        """主管声明它指挥了哪些下游节点 —— 这是向下追责链的边."""
        node = self.org.get(manager_id)
        if node is None or node.kind != "manager":
            raise KeyError(f"{manager_id} is not a manager")
        node.children = list(child_ids)
        if node.accountability is None:
            node.accountability = Accountability(did="", how="")
        node.accountability.delegated_to = list(child_ids)
        # 反向补齐下游的 delegated_by 指向(若未设)
        for cid in child_ids:
            child = self.org.get(cid)
            if child is not None and (child.accountability is None or
                                      child.accountability.delegated_by is None):
                if child.accountability is None:
                    child.accountability = Accountability(did="", how="")
                child.accountability.delegated_by = manager_id

    def audit_accountability(self, node_id: str) -> str:
        """汇报前逐层审查:校验责任条目齐全 + (执行者)skill凭证合规.

        审查规则:
          - did/how 必须非空 (空责任条目 = 没干, 拒)
          - 执行者必须带合规 SkillManifest (skill_used==bound_skill 且 evidence非空)
            ---- 这就是skill强制化的机制落点: 不调绑定skill -> manifest不合规 -> 拒审 -> 产物不签发 ----
          - 管理者不强制skill凭证(它负责编排,但其下游必须已审过)
        返回 'approved'/'rejected',拒绝时 node.accountability.audit_reason 列明。
        """
        node = self.org.get(node_id)
        if node is None:
            raise KeyError(f"no node {node_id}")
        acc = node.accountability
        reasons = []
        if acc is None:
            self._set_audit(node, "rejected", "no accountability recorded")
            return "rejected"
        if not (acc.did and acc.did.strip()):
            reasons.append("empty 'did'")
        if not (acc.how and acc.how.strip()):
            reasons.append("empty 'how'")
        # executor 必须有合规skill凭证 —— 强制点
        if node.kind == "executor":
            m = acc.skill_manifest
            if m is None:
                reasons.append("missing skill manifest (skill binding not enforced)")
            elif not m.is_compliant(node.bound_skill):
                reasons.append(
                    f"skill manifest non-compliant: used '{m.skill_used}' "
                    f"but bound skill is '{node.bound_skill}' (or empty evidence)"
                )
            else:
                # Layer 3: evidence must reference real skill file content
                real_skill = node.bound_skill or m.skill_used
                ev_res = validate_evidence(real_skill, m.evidence)
                if ev_res.get('valid') is False:
                    reasons.append(f"evidence doesn't match skill content: {ev_res.get('reason')}")
        if reasons:
            self._set_audit(node, "rejected", "; ".join(reasons))
            self.log_event("audit", node.node_id, {"reason": "; ".join(reasons), "result": "rejected"})
            return "rejected"
        self._set_audit(node, "approved", "")
        self.log_event("audit", node.node_id, {"reason": "approved", "result": "approved"})
        return "approved"

    def _set_audit(self, node, status, reason):
        if node.accountability is None:
            node.accountability = Accountability(did="", how="")
        node.accountability.audit_status = status
        node.accountability.audit_reason = reason

    def issue_product_key(self, node_id: str, product_key: str) -> bool:
        """准入门:只有审查通过(approved)的节点才签发产物key.

        没审 / 审不过 -> 产物不被接受(等同没做). 这是把 accountability+skill强制
        绑到'产物可信'的机制: 强制不在运行时拦截agent(),而在签发时拒签。
        返回True=签发, False=拒签(附理由存于该节点audit_reason)。
        """
        node = self.org.get(node_id)
        if node is None:
            raise KeyError(f"no node {node_id}")
        if node.accountability is None or node.accountability.audit_status != "approved":
            if node.accountability is None:
                self._set_audit(node, "rejected", "product requested w/o audit")
            return False
        if product_key in node.product_keys:
            return True  # idempotent
        node.product_keys.append(product_key)
        node.status = "done"
        self.log_event("product_key", node.node_id, {"key": product_key, "total_keys": len(node.product_keys)})
        return True

    def collect_and_audit_chain(self, manager_id: str) -> dict:
        """主管汇集:先逐个审查本部门下游执行者,全过审才把产物并入部门accountability.
        任一未过 -> 该部门状态置blocked + 记升级(走 send_back/escalate)。"""
        node = self.org.get(manager_id)
        if node is None or node.kind != "manager":
            raise KeyError(f"{manager_id} is not a manager")
        child_ids = node.children
        audit_results = {}
        all_ok = True
        for cid in child_ids:
            verdict = self.audit_accountability(cid)
            audit_results[cid] = verdict
            if verdict != "approved":
                all_ok = False
        if not all_ok:
            node.status = "blocked"
            self._record_escalation({"gateway": 2, "manager": manager_id,
                                    "reason": "downstream audit rejected",
                                    "rejected": [c for c, v in audit_results.items() if v != "approved"]})
            self.log_event("collect", manager_id, {"collected": False, "audit": audit_results})
            return {"collected": False, "audit": audit_results}
        # 主管自审(它要把下游成果整合成部门产出,自审did/how/evidence)
        own = self.audit_accountability(manager_id)
        self.log_event("collect", manager_id, {"collected": True, "audit": audit_results, "own": own})
        return {"collected": own == "approved", "audit": audit_results, "own": own}

    def trace_accountability(self, top_id: str | None = None) -> list[dict]:
        """从顶向下逐层追责:沿 delegated_to 链 DFS,把每个节点的 accountability dump出。
        可从指定节点钻, 默认从所有顶层(parent=None)管理者开始。返回按层级的追责链。"""
        def _gather(nid, acc_out, depth_seen):
            node = self.org.get(nid)
            if node is None or nid in depth_seen:
                return
            depth_seen.add(nid)
            a = node.accountability
            acc_out.append({
                "node": nid, "kind": node.kind, "department": node.department,
                "role": node.role, "depth": node.depth,
                "audit_status": a.audit_status if a else "missing",
                "did": a.did if a else "", "how": a.how if a else "",
                "evidence": a.evidence if a else "",
                "skill_used": (a.skill_manifest.skill_used if (a and a.skill_manifest) else None),
                "bound_skill": node.bound_skill,
                "delegated_to": (a.delegated_to if a else []),
            })
            # 边优先取 accountability.delegated_to;若空则兜底用 node.children
            kids = (a.delegated_to if a else []) or (node.children or [])
            for k in kids:
                _gather(k, acc_out, depth_seen)
        out: list[dict] = []
        seen: set = set()
        if top_id:
            _gather(top_id, out, seen)
        else:
            for nid, n in self.org.items():
                if n.parent is None:
                    _gather(nid, out, seen)
        return out

    # ---- message mediation (the ONLY legal send path) ----

    def configure_workflow(self, workflow: dict) -> None:
        """Apply workflow-config v2 explicit comm rules + meeting specs.

        Message edges and channel ACLs override the org-tree default isolation.
        """
        set_workflow_message_edges(set(workflow.get('message_edges', [])))
        channels = workflow.get('channels', {})
        acl = {k: v.get('acl', {'read': [], 'write': []}) for k, v in channels.items()}
        # 节点→频道归属：经 flow 边连到 channel 节点的 agent 属于该频道。
        # （channel 节点 id 只用于定位，不进入 node_channel 表）
        channel_by_node = {
            n['id']: n.get('channel', {}).get('key')
            for n in workflow.get('nodes', []) if n.get('type') == 'channel'
        }
        node_channel: dict = {}
        for e in workflow.get('flow_edges', []):
            src, tgt = e.get('source'), e.get('target')
            if src in channel_by_node and tgt not in channel_by_node:
                node_channel[tgt] = channel_by_node[src]
            elif tgt in channel_by_node and src not in channel_by_node:
                node_channel[src] = channel_by_node[tgt]
        set_workflow_channels(acl, node_channel)
        self._meetings = workflow.get('meetings', [])

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
        self.log_event("gateway", "kernel", {"gateway": 1, "task": task_description[:80]})
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
        arch_mgr = self.add_manager("manager_decompose",
                                    "Arch", parent=None, depth=1)
        for dep in deps:
            mgr = self.add_manager("manager_decompose", dep, parent=arch_mgr.node_id, depth=2)
            plan["departments"].append({"department": dep, "manager_id": mgr.node_id})
        self.log_event("decompose", "kernel", {"departments": departments})
        return plan

    def run_meeting(self, manager_verdicts: dict[str, str], cycle: int,
                    max_cycles: int = MAX_CYCLES_PER_LAYER) -> str:
        """Cross-department manager meeting — multi-round, until no new conflicts
        or cycle budget expended. Uses the flat orchestrator's veto vocabulary
        (accept/revise/escalate) so meeting outcomes map to the same semantics."""
        from multiagent_orchestrator import Orchestrator as _FlatOrch
        flat = _FlatOrch()
        decision = flat.apply_veto_rules(manager_verdicts, cycle, max_cycles)
        self.log_event("meeting", "kernel",
                       {"cycle": cycle, "decision": decision, "verdicts": manager_verdicts})
        self._cycles_by_layer.setdefault(2, 0)
        self._cycles_by_layer[2] = max(self._cycles_by_layer.get(2, 0), cycle)
        # escalate at budget exhaustion is the user-arbitration gateway (#2).
        if decision == "escalate":
            self._record_escalation({"gateway": 2, "cycle": cycle,
                                     "verdicts": manager_verdicts})
        # --- ECOSYSTEM BRIDGE: 循环分析 + 开会自动存档 ---
        # 1. 写入每轮协商状态到隔离目录(loop-engineering bridge),
        #    让循环分析有可追溯的状态(不污染 lean-hooks 主states)
        if self.bridge is not None:
            pattern = f"org-meeting-{self.session_id}"
            states_dir = (self.bridge.loop_dir
                          or (self.states_dir / "loop"))
            try:
                self.bridge.loop_write(
                    pattern, "last_cycle_verdict", decision, states_dir)
                self.bridge.loop_write(
                    pattern, "last_cycle", cycle, states_dir)
                self.bridge.loop_write(
                    pattern, "total_cycles", self._cycles_by_layer[2], states_dir)
            except Exception:
                # bridge degradation is silent; orchestrator still works.
                pass
            # 2. 失败模式:连续失败次数+循环分析(loop-failure-detector)
            if self._failures:
                try:
                    # commit the cumulative failure counter; loop-failure-detector reads it.
                    consec = max(self._failures.values())
                    self.bridge.loop_write(
                        pattern, "consecutive_failures", consec, states_dir)
                    fl = self.bridge.loop_fail_check(pattern, states_dir)
                    if fl.get("ok") and "rot_detected" in fl["stdout"]:
                        self._record_escalation(
                            {"gateway": 2, "cycle": cycle,
                             "reason": f"loop-failure-detector flagged: {fl['stdout'][:120]}"})
                except Exception:
                    pass
            # 3. 内存+档案:每轮会议自动归档(不在main的MEMORY.md上写),
            #    用auto-summary写到隔离db + one-shot JSON行到隔离archive_dir
            try:
                payload = {
                    "ts": _now_iso(), "session_id": self.session_id,
                    "cycle": cycle, "decision": decision,
                    "verdicts": manager_verdicts,
                    "cycles_total": self._cycles_by_layer[2],
                }
                self.bridge.archive_meeting(self.session_id, payload)
                self.bridge.archive_session(
                    project=f"org-engine-{self.session_id}",
                    summary=f"meeting cycle {cycle}: {decision}",
                    files_csv="contracts.json,org-state.json",
                    has_substance=True,
                )
            except Exception:
                pass
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
            self.log_event("dispatched", manager_id, {"role": ex["role"], "department": ex["department"], "node_id": node.node_id})
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
        self.log_event("send_back", target_id,
                       {"layer": layer, "cycles": cycles, "triple": triple})
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
        self.log_event("failure", executor_id, {"count": n, "node_id": executor_id})
        if n == 1:
            return "retry"
        node = self.org.get(executor_id)
        if node:
            node.status = "blocked"
        self._record_escalation({"gateway": 2, "executor": executor_id,
                                 "reason": "crash/timeout after retry"})
        # --- ECOSYSTEM BRIDGE: 写循环失败计数让loop-failure-detector可分析 ---
        if self.bridge is not None:
            try:
                pattern = f"org-meeting-{self.session_id}"
                states_dir = (self.bridge.loop_dir or (self.states_dir / "loop"))
                self.bridge.loop_write(pattern, "consecutive_failures", n, states_dir)
            except Exception:
                pass
        return "blocked"

    # ---- ecosystem bridge: skill 推荐 + 反馈 ----

    def recommend_skills_for_executor(self, role: str, task_text: str,
                                       top_k: int = 5) -> list[str]:
        """调skill-attention 给任务文本推荐 top-k skills.
        与registry的 bound_skill 协同: registry给出绑定, 但 skill-attention 给匹配度排名,
        若排名最高的skill和绑定不一致,审计阶段审计 manifest 的 skill_used 仍必须等于 bound_skill,
        也就是说: 推荐项是insight, 绑定才是硬约束 (registry 不能被推荐覆写).
        无ONNX模型或helper未装时返回空列表 (graceful degradation).
        """
        if self.bridge is None:
            return []
        rec = self.bridge.skill_recommend(task_text, top_k=top_k)
        self.log_event("skill_recommend", "kernel",
                       {"role": role, "task": task_text[:60], "unavailable": rec.get("unavailable", False)})
        if rec.get("unavailable"):
            return []
        # try to extract a list of skill names from many possible response shapes
        skills = rec.get("top_skills")
        out = []
        if isinstance(skills, list):
            for s in skills:
                if isinstance(s, str):
                    out.append(s)
                elif isinstance(s, dict):
                    name = s.get("name") or s.get("skill") or s.get("id")
                    if name:
                        out.append(str(name))
        return out

    def record_skill_signal(self, skill: str, signal: str, prompt: str = "") -> dict:
        """Expose a single signal to skill-attention training-loop (SkillOpt).
        signal ∈ {correct, fp, miss}. Silent degradation if helper missing.
        """
        if self.bridge is None:
            return {"skipped": True}
        return self.bridge.skill_feedback(skill, signal, prompt=prompt)

    # ---- escalation + user gateways ----

    def _record_escalation(self, payload: dict):
        st = self.state()
        st.setdefault("escalations", []).append(payload)
        st["escalations"][-1]["ts"] = _now_iso()
        self._save_state(st)

    def report_to_user(self) -> dict:
        """Gateway #3: final collection -> user decision."""
        self.log_event("gateway", "kernel",
                       {"gateway": 3, "org_size": len(self.org),
                        "escalations": len(self.state().get("escalations", []))})
        return {
            "gateway": 3,
            "org_size": len(self.org),
            "messages": len(self._messages),
            "escalations": self.state().get("escalations", []),
            "audit_log_size": len(self.audit_log),
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
        # --- ECOSYSTEM BRIDGE: 写入循环预算桶, 让loop-budget-tracker可分析 ---
        if self.bridge is not None:
            try:
                self.bridge.loop_budget_check(
                    budget_json=self.states_dir / "loop-budget.json",
                    remaining=remaining, total=budget_tokens)
            except Exception:
                pass
        return "ok"

    def dry_run_ecosystem_check(self) -> dict:
        """Probe integration health: which lean-hooks helpers are reachable. Useful
        during org-engine boot to log live vs degraded ecosystems."""
        if self.bridge is None:
            return {"bridge_unavailable": True}
        return self.bridge.dry_run_self_check()


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
