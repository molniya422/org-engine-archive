"""P2.5 tests — intent understanding with a fixed clock and fake provider.

Covers the plan's required scenarios: first request, added conditions,
anaphora ambiguity, task switch, cancel, restart recovery, unsupported
request. The conversation state side lives in
editor/backend-server/src/personal/conversation.ts (TS, owns the store);
this module tests the model-facing extraction half.
"""

from __future__ import annotations

import unittest
from datetime import datetime, timezone

from personal.constrained_output import ConstrainedGenerator
from personal.intent import IntentUnderstanding
from personal.model_types import ModelCallOptions
from personal.providers.fake import FakeProvider, FakeResponse

NOW = datetime(2026, 10, 9, 10, 0, 0, tzinfo=timezone.utc)
OPTS = ModelCallOptions(model="fake-mini", temperature=0.0)


def envelope(**over) -> dict:
    base = {
        "schema_version": 1,
        "id": "intent_01",
        "conversation_id": "conv_01",
        "task_type": "travel_plan",
        "goal": "比较上海的酒店",
        "entities": {"place": "上海"},
        "timezone": "UTC",
        "missing_fields": ["time", "budget"],
        "confidence": 0.8,
        "created_at": "2026-10-09T10:00:00Z",
    }
    base.update(over)
    return base


def make(script: dict) -> tuple[IntentUnderstanding, FakeProvider]:
    p = FakeProvider(script)
    return IntentUnderstanding(ConstrainedGenerator(p)), p


class TestIntentUnderstanding(unittest.TestCase):
    def test_scenario_1_first_request_understood(self):
        u, _ = make({"比较": FakeResponse(json=envelope())})
        out = u.understand("帮我比较上海的酒店", "conv_01", None, NOW, OPTS)
        self.assertEqual(out.status, "understood")
        self.assertEqual(out.envelope["task_type"], "travel_plan")
        self.assertIn("time", out.missing_fields)

    def test_scenario_2_added_conditions_update_fields(self):
        # "改成周五" updates the time field of the CURRENT intent.
        u, p = make({"周五": FakeResponse(json=envelope(
            id="intent_02",
            goal="比较上海的酒店，周五入住",
            entities={"place": "上海", "time": "2026-10-16"},
            missing_fields=["budget"],
        ))})
        out = u.understand("改成周五", "conv_01", "task_01", NOW, OPTS)
        self.assertEqual(out.status, "understood")
        self.assertEqual(out.envelope["entities"]["time"], "2026-10-16")
        self.assertNotIn("time", out.missing_fields)

    def test_scenario_3_ambiguous_anaphora_needs_clarification(self):
        # "刚才那个酒店" with low confidence -> must ask, never pick.
        u, _ = make({"刚才": FakeResponse(json=envelope(confidence=0.3, goal=" unspecified"))})
        out = u.understand("刚才那个酒店", "conv_01", "task_01", NOW, OPTS)
        self.assertEqual(out.status, "needs_clarification")
        self.assertTrue(out.reason)

    def test_scenario_5_cancel_is_a_valid_intent(self):
        u, _ = make({"取消": FakeResponse(json=envelope(
            id="intent_03", task_type="unknown", goal="取消当前事项", confidence=0.9,
        ))})
        out = u.understand("取消", "conv_01", "task_01", NOW, OPTS)
        # unknown task_type + understood wording = unsupported with honest reason;
        # cancel handling itself is the conversation layer's job.
        self.assertEqual(out.status, "unsupported")
        self.assertIn("办不了", out.reason)

    def test_scenario_7_unsupported_request_is_honest(self):
        u, _ = make({"买机票": FakeResponse(json=envelope(
            id="intent_04", task_type="unknown", goal="订机票", confidence=0.95,
        ))})
        out = u.understand("帮我买机票", "conv_01", None, NOW, OPTS)
        self.assertEqual(out.status, "unsupported")
        self.assertIn("暂时还办不了", out.reason)

    def test_low_confidence_routes_to_clarification_not_fact(self):
        u, _ = make({"天气": FakeResponse(json=envelope(
            id="intent_05", task_type="weather_reminder", confidence=0.4,
        ))})
        out = u.understand("也许要提醒天气吧", "conv_01", None, NOW, OPTS)
        self.assertEqual(out.status, "needs_clarification")

    def test_model_garbage_needs_clarification(self):
        u, _ = make({
            "乱": FakeResponse(json={"garbage": True}),
            "校验错误": FakeResponse(raw="{nope"),
        })
        out = u.understand("这句话很乱", "conv_01", None, NOW, OPTS)
        self.assertEqual(out.status, "needs_clarification")
        self.assertIn("换一种说法", out.reason)

    def test_prompt_carries_timezone_and_current_task(self):
        u, p = make({"比较": FakeResponse(json=envelope())})
        u.understand("帮我比较上海的酒店", "conv_01", "task_09", NOW, OPTS)
        prompt = p.calls[0][0]
        self.assertIn("2026-10-09", prompt)
        self.assertIn("UTC", prompt)
        self.assertIn("task_09", prompt)


if __name__ == "__main__":
    unittest.main()
