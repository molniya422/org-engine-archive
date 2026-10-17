"""P7.2 tests — learning proposals.

验收：用户能看到「为什么建议这条规则」，并能拒绝而不影响任务。
- 只有重复且一致的行为才生成候选规则。
- 单次拒绝不自动推断长期偏好。
- 每个提案显示例子、影响范围、反例和风险。
- 高敏感规则必须人工批准（且不进入默认提案）。
- 规则默认 proposed，不直接 active。
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from personal.learning.signals import BehaviorSignal, BehaviorSignalRecorder
from personal.learning.proposer import (
    DEFAULT_STATUS,
    HIGH_SENSITIVITY_NEEDS_APPROVAL,
    MIN_REPEAT,
    Proposer,
)

TASK = "task_01"
TRACE = "decision_01"
EVIDENCE = ["evidence_01"]


def sig(**kw) -> BehaviorSignal:
    rec = BehaviorSignalRecorder()
    base = dict(
        event="edited", task_id=TASK, trace_id=TRACE, evidence_ids=EVIDENCE,
        sensitivity="normal",
        before={"due": "2026-10-15"}, after={"due": "2026-10-20"},
    )
    base.update(kw)
    event = base.pop("event")
    return rec.record(
        event=event,
        task_id=base.pop("task_id"),
        trace_id=base.pop("trace_id"),
        evidence_ids=list(base.pop("evidence_ids")),
        sensitivity=base.pop("sensitivity"),
        before=base.pop("before"),
        after=base.pop("after"),
    )


class RepeatConsistencyTest(unittest.TestCase):
    def test_only_repeated_consistent_changes_become_candidates(self):
        p = Proposer()
        # 同一个字段（due）一致改成 2026-10-20，两次 → 候选。
        candidates = p.propose([
            sig(trace_id="t1", before={"due": "2026-10-15"}, after={"due": "2026-10-20"}),
            sig(trace_id="t2", before={"due": "2026-10-16"}, after={"due": "2026-10-20"}),
        ])
        self.assertEqual(len(candidates), 1)
        self.assertEqual(candidates[0].rule["when"], {"field": "due"})
        self.assertEqual(candidates[0].rule["then"], {"value": "2026-10-20"})

    def test_single_correction_never_creates_a_candidate(self):
        p = Proposer()
        candidates = p.propose([
            sig(trace_id="t1", before={"due": "2026-10-15"}, after={"due": "2026-10-20"}),
        ])
        self.assertEqual(candidates, [])

    def test_inconsistent_changes_do_not_merge(self):
        p = Proposer()
        # 同一字段改成了不同值 → 不一致，不聚类成一条规则。
        candidates = p.propose([
            sig(trace_id="t1", before={"due": "2026-10-15"}, after={"due": "2026-10-20"}),
            sig(trace_id="t2", before={"due": "2026-10-15"}, after={"due": "2026-10-21"}),
        ])
        self.assertEqual(candidates, [])


class ProposalContentTest(unittest.TestCase):
    def test_proposal_shows_examples_scope_counterexamples_and_risk(self):
        p = Proposer()
        [prop] = p.propose([
            sig(trace_id="t1", before={"due": "2026-10-15"}, after={"due": "2026-10-20"}),
            sig(trace_id="t2", before={"due": "2026-10-16"}, after={"due": "2026-10-20"}),
        ])
        d = prop.to_dict()
        self.assertTrue(d["examples"])           # 有例子
        self.assertTrue(d["scope"])              # 有影响范围
        self.assertTrue(d["counterexamples"])    # 有反例
        self.assertTrue(d["risk"])               # 有风险说明
        self.assertEqual(sorted(d["supporting_trace_refs"]), ["t1", "t2"])
        self.assertEqual(prop.status, DEFAULT_STATUS)

    def test_default_proposal_is_not_active(self):
        p = Proposer()
        [prop] = p.propose([
            sig(trace_id="t1", before={"due": "2026-10-15"}, after={"due": "2026-10-20"}),
            sig(trace_id="t2", before={"due": "2026-10-16"}, after={"due": "2026-10-20"}),
        ])
        self.assertEqual(prop.rule["status"], "proposed")
        self.assertNotEqual(prop.rule["status"], "active")


class HighSensitivityTest(unittest.TestCase):
    def test_high_sensitivity_signals_never_form_candidates(self):
        p = Proposer()
        # 高敏感信号没有可用的 before/after 正文 → 无法聚类，直接排除。
        candidates = p.propose([
            sig(sensitivity="high", trace_id="t1", before={"x": "敏感1"}, after={"x": "敏感2"}),
            sig(sensitivity="high", trace_id="t2", before={"x": "敏感1"}, after={"x": "敏感2"}),
        ])
        self.assertEqual(candidates, [])

    def test_high_sensitivity_needs_approval_flag(self):
        self.assertTrue(HIGH_SENSITIVITY_NEEDS_APPROVAL)


class MinRepeatConstantTest(unittest.TestCase):
    def test_min_repeat_is_two(self):
        self.assertEqual(MIN_REPEAT, 2)


if __name__ == "__main__":
    unittest.main()