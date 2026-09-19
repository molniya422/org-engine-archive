"""Mutation 规则(v1 三条)— 纯函数:events[, org] → 提案列表。"""
import uuid
from collections import defaultdict

MIN_EVIDENCE = 3
QA_REVIEWER_ROLE = {
    "id": "qa.reviewer", "name": "reviewer",
    "agentType": "general-purpose", "bound_skills": ["pr-review"],
}


def _proposal(rule, org_ref, changes, evidence, rationale):
    return {
        "id": f"prop-{uuid.uuid4().hex[:8]}",
        "org_ref": org_ref, "rule": rule,
        "changes": changes, "evidence": evidence,
        "rationale": rationale, "status": "proposed",
    }


def rule_dispatch_review(events, org_ref):
    """dispatch_miss ≥3 → 给 QA 部门加 reviewer 角色。"""
    ev = [e for e in events if e["kind"] == "dispatch_miss"]
    if len(ev) < MIN_EVIDENCE:
        return []
    return [_proposal(
        "dispatch_review", org_ref,
        [{"op": "add_role", "dept": "QA", "role": QA_REVIEWER_ROLE}],
        ev,
        f"窗口内 dispatch_miss {len(ev)} 次(阈值 {MIN_EVIDENCE}),建议 QA 部门增加独立评审角色。",
    )]


def _find_bindings(org, skill):
    out = []
    for dept in org.get("org", {}).get("departments", []):
        for role in dept.get("roles", []):
            if skill in (role.get("bound_skills") or []):
                out.append((dept["name"], role.get("id")))
    return out


def rule_skill_rebind(events, org, org_ref):
    """同一 skill 误触发 ≥3 → 重绑(有 suggest)或解绑。"""
    by_skill = defaultdict(list)
    for e in events:
        if e["kind"] == "skill_miss" and e["payload"].get("skill"):
            by_skill[e["payload"]["skill"]].append(e)
    proposals = []
    for skill, ev in by_skill.items():
        if len(ev) < MIN_EVIDENCE:
            continue
        suggest = next((e["payload"]["suggest"] for e in ev if e["payload"].get("suggest")), None)
        op = ({"op": "rebind_skill", "skill": skill, "target": suggest} if suggest
              else {"op": "unbind_skill", "skill": skill})
        bindings = _find_bindings(org, skill)
        rationale = (f"skill `{skill}` 窗口内误触发 {len(ev)} 次,"
                     f"绑定于 {bindings or '无'},建议{'改绑 ' + suggest if suggest else '解除绑定'}。")
        proposals.append(_proposal("skill_rebind", org_ref, [op], ev, rationale))
    return proposals


def rule_contract_bump(events, org, org_ref):
    """同一契约被违约 ≥3 → 契约 version+1。"""
    by_key = defaultdict(list)
    for e in events:
        if e["kind"] == "contract_violation" and e["payload"].get("contract"):
            by_key[e["payload"]["contract"]].append(e)
    proposals = []
    contracts = org.get("org", {}).get("contracts", []) or []
    keys = {c.get("key") for c in contracts}
    for key, ev in by_key.items():
        if len(ev) < MIN_EVIDENCE or key not in keys:
            continue
        proposals.append(_proposal(
            "contract_bump", org_ref,
            [{"op": "bump_contract", "contract": key}],
            ev,
            f"契约 `{key}` 窗口内被违约 {len(ev)} 次,建议 version+1 并审查。",
        ))
    return proposals


def propose(events, org, org_ref="default-org"):
    out = []
    out += rule_dispatch_review(events, org_ref)
    out += rule_skill_rebind(events, org, org_ref)
    out += rule_contract_bump(events, org, org_ref)
    return out