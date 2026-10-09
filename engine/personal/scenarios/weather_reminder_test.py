"""P5.5 tests — weather reminder capability pack.

验收：冻结天气 fixture、过期数据、地点歧义、断网场景；
任何提醒都能追溯到天气来源和用户已确认偏好。
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from personal.scenarios.weather_reminder import (
    WeatherSource,
    WeatherDataError,
    WeatherReminderScenario,
    WeatherFact,
)


def frozen_source() -> WeatherSource:
    """冻结 fixture：北京 2026-10-09，气温 8°C（体感 5°C），有雨，无预警。"""
    return WeatherSource(fetch=lambda place, day: {
        "place": "北京市", "date": "2026-10-09", "temp_c": 8, "feels_like_c": 5,
        "rain_mm": 3.2, "alert": None, "fetched_at": "2026-10-09T07:00:00+08:00",
    })


class TestWeatherPack(unittest.TestCase):
    def test_requires_explicit_enable_and_place(self):
        """只在用户明确开启天气来源并选择地点后启用。"""
        s = WeatherReminderScenario(source=frozen_source(), enabled=False, places=[])
        outcome = s.run("明天要带伞吗")
        self.assertFalse(outcome.enabled)
        self.assertIn("开启", outcome.needs[0])

    def test_place_ambiguity_asks_not_guesses(self):
        """地点歧义（多个匹配）→ 需要补充信息，不猜测。"""
        s = WeatherReminderScenario(
            source=frozen_source(), enabled=True,
            places=["北京市朝阳区", "北京市海淀区"])
        outcome = s.run("明天要带伞吗", place_query="北京")
        self.assertTrue(any("选择一个地点" in n or "匹配到" in n for n in outcome.needs))
        self.assertEqual(outcome.fact, None)

    def test_query_saves_source_time_place(self):
        """查询温度/体感/降雨/预警，并保存来源、时间和地点。"""
        s = WeatherReminderScenario(source=frozen_source(), enabled=True, places=["北京市"])
        outcome = s.run("明天要带伞吗", place_query="北京市", today="2026-10-09")
        f = outcome.fact
        assert f is not None
        self.assertEqual(f.temp_c, 8)
        self.assertEqual(f.feels_like_c, 5)
        self.assertEqual(f.source["place"], "北京市")
        self.assertEqual(f.source["fetched_at"], "2026-10-09T07:00:00+08:00")

    def test_stale_data_flagged_not_used(self):
        """数据过期 → 显示需要补充的信息，不基于过期数据生成提醒。"""
        stale = WeatherSource(fetch=lambda place, day: {
            "place": "北京市", "date": "2026-10-09", "temp_c": 8, "feels_like_c": 5,
            "rain_mm": 0, "alert": None, "fetched_at": "2026-10-08T07:00:00+08:00",
        })
        s = WeatherReminderScenario(source=stale, enabled=True, places=["北京市"])
        outcome = s.run("明天要带伞吗", place_query="北京市",
                        today="2026-10-09", max_age_hours=6)
        self.assertEqual(outcome.fact, None)
        self.assertTrue(any("过期" in n for n in outcome.needs))

    def test_network_failure_is_recoverable(self):
        """断网 → 可恢复错误，不猜测。"""
        def boom(place, day):
            raise ConnectionError("offline")
        s = WeatherReminderScenario(source=WeatherSource(fetch=boom), enabled=True,
                                    places=["北京市"])
        outcome = s.run("明天要带伞吗", place_query="北京市")
        self.assertEqual(outcome.fact, None)
        self.assertTrue(any("无法获取" in n for n in outcome.needs))

    def test_fact_and_preference_shown_separately(self):
        """天气事实与用户偏好分开显示。"""
        s = WeatherReminderScenario(source=frozen_source(), enabled=True, places=["北京市"])
        outcome = s.run("明天要带伞吗", place_query="北京市", today="2026-10-09",
                        preferences={"怕冷": True, "携带雨具": True})
        d = outcome.to_dict()
        self.assertIn("weather_fact", d)
        self.assertIn("user_preferences", d)
        self.assertNotEqual(d["weather_fact"], d["user_preferences"])

    def test_reminder_candidate_traces_source_and_preference(self):
        """提醒候选可追溯到天气来源 + 用户已确认偏好。"""
        s = WeatherReminderScenario(source=frozen_source(), enabled=True, places=["北京市"])
        outcome = s.run("明天要带伞吗", place_query="北京市", today="2026-10-09",
                        preferences={"携带雨具": True})
        self.assertTrue(outcome.reminder_candidates)
        cand = outcome.reminder_candidates[0]
        self.assertEqual(cand["trace"]["source_place"], "北京市")
        self.assertEqual(cand["trace"]["source_fetched_at"], "2026-10-09T07:00:00+08:00")
        self.assertEqual(cand["trace"]["preference"], "携带雨具")
        self.assertFalse(cand["auto_created"])

    def test_in_app_only_never_third_party(self):
        """默认只在应用内提醒，不发送给第三方。"""
        s = WeatherReminderScenario(source=frozen_source(), enabled=True, places=["北京市"])
        outcome = s.run("明天要带伞吗", place_query="北京市", today="2026-10-09",
                        preferences={"携带雨具": True})
        for cand in outcome.reminder_candidates:
            self.assertEqual(cand["channel"], "in_app")

    def test_alert_data_preserved(self):
        """预警信息原样保存到事实里。"""
        alerting = WeatherSource(fetch=lambda place, day: {
            "place": "北京市", "date": "2026-10-09", "temp_c": 2, "feels_like_c": -3,
            "rain_mm": 0, "alert": "寒潮蓝色预警", "fetched_at": "2026-10-09T07:00:00+08:00",
        })
        s = WeatherReminderScenario(source=alerting, enabled=True, places=["北京市"])
        outcome = s.run("明天冷吗", place_query="北京市", today="2026-10-09",
                        preferences={"怕冷": True})
        assert outcome.fact is not None
        self.assertEqual(outcome.fact.alert, "寒潮蓝色预警")


if __name__ == "__main__":
    unittest.main()
