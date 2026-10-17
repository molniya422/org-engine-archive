"""P7.1 tests — behavior signals.

验收：一次用户修改可以完整追溯到原任务，但不能泄露敏感正文。
- 记录 accepted / edited / rejected / revoked / repeated_correction。
- 记录修改前后 action 和文本 diff。
- 脱敏后再写入。
- 高敏感信息只保存事件类型。
- 每个事件关联 task、trace、evidence。
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from personal.learning.signals import (
    BehaviorSignalRecorder,
    SIGNAL_EVENTS,
    redact_text,
    redact_value,
)

TASK = "task_01"
TRACE = "trace_01"
EVIDENCE = ["ev_01", "ev_02"]


def recorder() -> BehaviorSignalRecorder:
    return BehaviorSignalRecorder()


class SignalEventTypesTest(unittest.TestCase):
    def test_records_all_five_event_types(self):
        rec = recorder()
        rec.record(event="accepted", task_id=TASK, trace_id=TRACE, evidence_ids=EVIDENCE)
        rec.record(event="edited", task_id=TASK, trace_id=TRACE, evidence_ids=EVIDENCE,
                   before={"title": "A"}, after={"title": "B"})
        rec.record(event="rejected", task_id=TASK, trace_id=TRACE, evidence_ids=EVIDENCE)
        rec.record(event="revoked", task_id=TASK, trace_id=TRACE, evidence_ids=EVIDENCE)
        rec.record(event="repeated_correction", task_id=TASK, trace_id=TRACE, evidence_ids=EVIDENCE,
                   before={"title": "B"}, after={"title": "C"})
        self.assertEqual({s.event for s in rec.signals}, SIGNAL_EVENTS)

    def test_unknown_event_is_refused(self):
        with self.assertRaises(ValueError):
            recorder().record(event="liked", task_id=TASK, trace_id=TRACE, evidence_ids=EVIDENCE)


class TraceabilityTest(unittest.TestCase):
    def test_event_links_task_trace_and_evidence(self):
        rec = recorder()
        sig = rec.record(event="edited", task_id=TASK, trace_id=TRACE, evidence_ids=EVIDENCE,
                         before={"due": "2026-10-15"}, after={"due": "2026-10-20"})
        d = sig.to_dict()
        self.assertEqual(d["task_id"], TASK)
        self.assertEqual(d["trace_id"], TRACE)
        self.assertEqual(d["evidence_ids"], EVIDENCE)

    def test_event_without_evidence_is_refused(self):
        with self.assertRaises(ValueError):
            recorder().record(event="accepted", task_id=TASK, trace_id=TRACE, evidence_ids=[])

    def test_event_without_trace_is_refused(self):
        with self.assertRaises(ValueError):
            recorder().record(event="accepted", task_id=TASK, trace_id="", evidence_ids=EVIDENCE)

    def test_same_inputs_are_deterministic(self):
        a = recorder().record(event="accepted", task_id=TASK, trace_id=TRACE,
                              evidence_ids=EVIDENCE, recorded_at="2026-10-17T10:00:00Z")
        b = recorder().record(event="accepted", task_id=TASK, trace_id=TRACE,
                              evidence_ids=EVIDENCE, recorded_at="2026-10-17T10:00:00Z")
        self.assertEqual(a.event_id, b.event_id)


class DiffTest(unittest.TestCase):
    def test_edit_records_before_after_and_diff(self):
        rec = recorder()
        sig = rec.record(
            event="edited", task_id=TASK, trace_id=TRACE, evidence_ids=EVIDENCE,
            before={"title": "报销单A", "due": "2026-10-15"},
            after={"title": "报销单A", "due": "2026-10-20"},
        )
        d = sig.to_dict()
        self.assertEqual(d["before"]["due"], "2026-10-15")
        self.assertEqual(d["after"]["due"], "2026-10-20")
        self.assertEqual(d["diff"], {"due": {"before": "2026-10-15", "after": "2026-10-20"}})

    def test_correction_helper_marks_repeated_corrections(self):
        rec = recorder()
        first = rec.record_correction(
            task_id=TASK, trace_id=TRACE, evidence_ids=EVIDENCE,
            original={"due": "2026-10-15"}, corrected={"due": "2026-10-18"},
        )
        again = rec.record_correction(
            task_id=TASK, trace_id=TRACE, evidence_ids=EVIDENCE,
            original={"due": "2026-10-15"}, corrected={"due": "2026-10-20"},
            repeated=True,
        )
        self.assertEqual(first.event, "edited")
        self.assertEqual(again.event, "repeated_correction")

    def test_free_text_edit_diff_is_recorded(self):
        rec = recorder()
        sig = rec.record(
            event="edited", task_id=TASK, trace_id=TRACE, evidence_ids=EVIDENCE,
            before="提醒我周五交报销",
            after="提醒我周六交报销",
        )
        d = sig.to_dict()
        self.assertEqual(d["diff"]["before"], "提醒我周五交报销")
        self.assertEqual(d["diff"]["after"], "提醒我周六交报销")


class RedactionTest(unittest.TestCase):
    def test_id_number_and_phone_are_redacted_before_write(self):
        rec = recorder()
        sig = rec.record(
            event="edited", task_id=TASK, trace_id=TRACE, evidence_ids=EVIDENCE,
            before={"note": "身份证 110101199001011234 电话 13800138000"},
            after={"note": "身份证 110101199001011234 电话 13900139000"},
        )
        serialized = str(sig.to_dict())
        self.assertNotIn("110101199001011234", serialized)
        self.assertNotIn("13800138000", serialized)
        self.assertIn("<redacted>", serialized)

    def test_sensitive_field_names_are_redacted_entirely(self):
        rec = recorder()
        sig = rec.record(
            event="edited", task_id=TASK, trace_id=TRACE, evidence_ids=EVIDENCE,
            before={"salary": "18000", "address": "某小区 1 栋"},
            after={"salary": "20000", "address": "某小区 1 栋"},
        )
        d = sig.to_dict()
        self.assertEqual(d["before"]["salary"], "<redacted>")
        self.assertEqual(d["after"]["salary"], "<redacted>")
        self.assertEqual(d["after"]["address"], "<redacted>")
        self.assertEqual(d["diff"], {})

    def test_redact_text_leaves_normal_text_alone(self):
        self.assertEqual(redact_text("提醒我周五交报销"), "提醒我周五交报销")
        self.assertEqual(redact_value([1, "abc"]), [1, "abc"])


class HighSensitivityTest(unittest.TestCase):
    def test_high_sensitivity_stores_event_type_only(self):
        rec = recorder()
        sig = rec.record(
            event="edited", task_id=TASK, trace_id=TRACE, evidence_ids=EVIDENCE,
            sensitivity="high",
            before={"diagnosis": "某个很敏感的正文"},
            after={"diagnosis": "另一个很敏感的正文"},
        )
        d = sig.to_dict()
        self.assertEqual(d["event"], "edited")
        self.assertTrue(d["content_redacted"])
        self.assertNotIn("before", d)
        self.assertNotIn("after", d)
        self.assertNotIn("diff", d)
        self.assertNotIn("敏感", str(d))

    def test_normal_sensitivity_marks_content_not_redacted(self):
        sig = recorder().record(event="accepted", task_id=TASK, trace_id=TRACE,
                                evidence_ids=EVIDENCE)
        self.assertFalse(sig.to_dict()["content_redacted"])


class SinkTest(unittest.TestCase):
    def test_sink_receives_redacted_dict_only(self):
        written: list[dict] = []
        rec = BehaviorSignalRecorder(sink=written.append)
        rec.record(event="edited", task_id=TASK, trace_id=TRACE, evidence_ids=EVIDENCE,
                   before={"phone": "13800138000"}, after={"phone": "13900139000"})
        self.assertEqual(len(written), 1)
        self.assertNotIn("13800138000", str(written))


if __name__ == "__main__":
    unittest.main()
