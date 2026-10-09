"""P5.5 — weather reminder capability pack.

只在用户明确开启天气来源并选择地点后启用。查询温度/体感/降雨/预警并保存
来源、时间和地点。天气事实与用户偏好分开显示。生成应用内提醒候选，不自动
发送给第三方。天气接口失败、数据过期或地点不明确 → 显示需要补充的信息，
不猜测。
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Callable

FetchFn = Callable[[str, str], dict[str, Any]]


class WeatherDataError(RuntimeError):
    """天气来源失败或数据格式不合法——调用方应显示"需要补充"，而非猜。"""


@dataclass(frozen=True)
class WeatherSource:
    fetch: FetchFn


@dataclass(frozen=True)
class WeatherFact:
    place: str
    date: str
    temp_c: float
    feels_like_c: float
    rain_mm: float
    alert: str | None
    source: dict[str, Any]       # 来源、时间、地点全程可追溯


@dataclass
class WeatherOutcome:
    enabled: bool
    fact: WeatherFact | None = None
    needs: list[str] = field(default_factory=list)
    reminder_candidates: list[dict[str, Any]] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "enabled": self.enabled,
            "weather_fact": self.fact.__dict__ if self.fact else None,
            "user_preferences": self._preferences,   # 单独字段，事实与偏好分开
            "needs": list(self.needs),
            "reminder_candidates": list(self.reminder_candidates),
        }

    _preferences: dict[str, Any] = field(default_factory=dict)


def _is_stale(fetched_at: str, today: str, max_age_hours: int) -> bool:
    """过期 = 来源日期不是今天（跨天数据对"明天"的计划不可信）。"""
    try:
        fetched = datetime.fromisoformat(fetched_at)
    except ValueError:
        return True   # 无法解析的时间一律视为过期
    return fetched.date().isoformat() != today


class WeatherReminderScenario:
    def __init__(self, source: WeatherSource, enabled: bool,
                 places: list[str]) -> None:
        self.source = source
        self.enabled = enabled
        self.places = places

    def run(
        self,
        utterance: str,
        place_query: str | None = None,
        today: str = "2026-10-09",
        preferences: dict[str, Any] | None = None,
        max_age_hours: int = 12,
    ) -> WeatherOutcome:
        prefs = preferences or {}
        if not self.enabled or not self.places:
            return WeatherOutcome(
                enabled=False,
                needs=["天气功能还没有开启。请在设置里开启天气来源并选择地点。"],
            )

        # 地点匹配：0 个或多个匹配都要问，不猜。
        matches = [p for p in self.places if place_query and place_query in p] if place_query else []
        if len(matches) != 1:
            if not place_query:
                return WeatherOutcome(enabled=True, needs=["请告诉我你想查询哪个地点。"])
            return WeatherOutcome(
                enabled=True,
                needs=[f"“{place_query}”匹配到 {len(matches)} 个地点：{matches}。请选择一个地点。"]
                if matches else [f"没有找到地点“{place_query}”。请检查后再试。"],
            )

        try:
            raw = self.source.fetch(matches[0], today)
        except Exception:
            return WeatherOutcome(
                enabled=True,
                needs=["暂时无法获取天气数据（网络问题）。稍后再试，我不会猜测。"],
            )

        fetched_at = str(raw.get("fetched_at", ""))
        if not fetched_at or _is_stale(fetched_at, today, max_age_hours):
            return WeatherOutcome(
                enabled=True,
                needs=["天气数据已过期。需要重新获取后才能生成提醒。"],
            )

        try:
            fact = WeatherFact(
                place=str(raw["place"]), date=str(raw["date"]),
                temp_c=float(raw["temp_c"]), feels_like_c=float(raw["feels_like_c"]),
                rain_mm=float(raw["rain_mm"]),
                alert=raw.get("alert"),
                source={"place": raw["place"], "fetched_at": fetched_at,
                        "provider": getattr(self.source, "name", "fixture")},
            )
        except (KeyError, TypeError, ValueError) as e:
            raise WeatherDataError(f"天气数据格式不合法: {e}") from e

        # 提醒候选：基于事实 + 已确认偏好，可追溯。
        candidates: list[dict[str, Any]] = []
        if fact.rain_mm > 0 and prefs.get("携带雨具"):
            candidates.append({
                "kind": "create_reminder_candidate",
                "title": f"明天{fact.place}有雨，记得带伞",
                "due": fact.date,
                "channel": "in_app",           # 默认应用内，不发第三方
                "auto_created": False,
                "trace": {
                    "source_place": fact.source["place"],
                    "source_fetched_at": fact.source["fetched_at"],
                    "preference": "携带雨具",
                },
            })
        if fact.feels_like_c <= 5 and prefs.get("怕冷"):
            candidates.append({
                "kind": "create_reminder_candidate",
                "title": f"明天{fact.place}体感{fact.feels_like_c:g}°C，多穿一点",
                "due": fact.date,
                "channel": "in_app",
                "auto_created": False,
                "trace": {
                    "source_place": fact.source["place"],
                    "source_fetched_at": fact.source["fetched_at"],
                    "preference": "怕冷",
                },
            })

        return WeatherOutcome(enabled=True, fact=fact, reminder_candidates=candidates,
                              _preferences=prefs)
