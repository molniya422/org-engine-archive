from learning.rules import propose, rule_dispatch_review, rule_skill_rebind, rule_contract_bump

ORG = {"org": {"name": "t", "departments": [
    {"name": "QA", "roles": []},
    {"name": "FE", "roles": [{"id": "fe.p", "name": "p", "agentType": "g", "bound_skills": ["dpa"]}]},
], "contracts": [{"key": "ui", "owner_dept": "FE", "version": "1"}]}}

NOW = "2026-09-11T00:00:00+00:00"
MISS3 = [{"ts": NOW, "run_id": "r", "kind": "dispatch_miss", "payload": {}}] * 3
SKILL_MISS = [{"ts": NOW, "run_id": "r", "kind": "skill_miss",
               "payload": {"skill": "dpa", "suggest": "redesign-skill"}}] * 3
CONTRACT_VIO = [{"ts": NOW, "run_id": "r", "kind": "contract_violation",
                 "payload": {"contract": "ui"}}] * 3


def test_dispatch_review_adds_reviewer_when_3_misses():
    out = rule_dispatch_review(MISS3, "t")
    assert len(out) == 1
    assert out[0]["changes"][0]["op"] == "add_role"
    assert out[0]["changes"][0]["dept"] == "QA"
    assert len(out[0]["evidence"]) == 3


def test_dispatch_review_silent_below_threshold():
    assert rule_dispatch_review(MISS3[:2], "t") == []


def test_skill_rebind_uses_suggest():
    out = rule_skill_rebind(SKILL_MISS, ORG, "t")
    assert out[0]["changes"][0] == {"op": "rebind_skill", "skill": "dpa", "target": "redesign-skill"}


def test_skill_rebind_unbinds_without_suggest():
    ev = [{"ts": NOW, "run_id": "r", "kind": "skill_miss", "payload": {"skill": "dpa"}}] * 3
    out = rule_skill_rebind(ev, ORG, "t")
    assert out[0]["changes"][0] == {"op": "unbind_skill", "skill": "dpa"}


def test_contract_bump_increments():
    out = rule_contract_bump(CONTRACT_VIO, ORG, "t")
    assert out[0]["changes"][0] == {"op": "bump_contract", "contract": "ui"}


def test_propose_aggregates_all_three():
    evs = MISS3 + SKILL_MISS + CONTRACT_VIO
    out = propose(evs, ORG, "t")
    rules = sorted(p["rule"] for p in out)
    assert rules == ["contract_bump", "dispatch_review", "skill_rebind"]