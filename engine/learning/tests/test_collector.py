from learning.collector import collect_feedback_md, collect_run_log, run_collection


FEEDBACK = """## SkillOpt — Skill Trigger Accuracy

### Miss
- [skill:dpa] [prompt:"t2"]

### False Positive
- [skill:pm] [prompt:"t3"]

## MultiAgentOpt — Agent Dispatch Accuracy

### Miss
- dispatch missed

### False Positive
"""

RUN_LOG = """{"init": true}
{"run_id": "r1", "pattern": "health-check", "outcome": "failed", "iso": "2026-07-09T00:00:00Z"}
{"run_id": "r2", "pattern": "impl", "outcome": "ok", "iso": "2026-07-10T00:00:00Z"}
"""


def test_feedback_parses_miss_and_fp(tmp_path):
    p = tmp_path / "feedback.md"
    p.write_text(FEEDBACK, encoding="utf-8")
    evs = collect_feedback_md(p)
    kinds = sorted(e["kind"] for e in evs)
    assert kinds == ["dispatch_miss", "skill_fp", "skill_miss"]
    dpa = [e for e in evs if e["kind"] == "skill_miss"]
    assert dpa[0]["payload"]["skill"] == "dpa"


def test_run_log_emits_budget_warn_for_non_ok(tmp_path):
    p = tmp_path / "run-log.jsonl"
    p.write_text(RUN_LOG, encoding="utf-8")
    evs = collect_run_log(p)
    assert len(evs) == 1
    assert evs[0]["kind"] == "budget_warn"
    assert evs[0]["payload"]["pattern"] == "health-check"


def test_collection_is_idempotent(tmp_path):
    fb = tmp_path / "feedback.md"; fb.write_text(FEEDBACK, encoding="utf-8")
    rl = tmp_path / "run-log.jsonl"; rl.write_text(RUN_LOG, encoding="utf-8")
    out = tmp_path / "events.jsonl"
    assert run_collection(fb, rl, out) == 4      # 3 feedback + 1 budget_warn
    assert run_collection(fb, rl, out) == 0      # 第二次去重后 0 新增