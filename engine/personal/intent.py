"""P2.5 — intent understanding (engine side).

Turns a user utterance into a constrained IntentEnvelope using the
ConstrainedGenerator (P2.3) against the P1.1 intent-envelope schema.

Rules from the plan:
- The envelope keeps the user's original words and the parsing timezone.
- Confidence only routes clarification (>= threshold -> proceed planning,
  < threshold -> ask). It NEVER upgrades a statement into a fact.
- Missing fields are listed explicitly; the model may not invent values.
- Unsupported task types come back as task_type=unknown with a reason —
  the caller must tell the user honestly instead of guessing.

Deterministic: with the FakeProvider the whole pipeline is reproducible;
real models plug in through the same interface (P2.2 adapters).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from zoneinfo import ZoneInfo

from .constrained_output import ConstrainedGenerator, ConstrainedOutputError
from .model_types import ModelCallOptions

INTENT_SCHEMA = "intent-envelope"

SUPPORTED_TASK_TYPES = ("file_organize", "weather_reminder", "travel_plan", "calendar", "draft")

PROMPT_TEMPLATE = """你是个人事务助理的理解模块。把用户的话压缩成一个 IntentEnvelope JSON 对象。

用户的话：
{utterance}

当前时间：{now}（时区 {tz}）
对话中此前提到的当前事项 task_id：{current_task}

要求：
- task_type 只能是：{task_types}，不支持的事务用 "unknown"。
- 只提取用户明确说出的字段；没有说的字段不要编造，加入 missing_fields。
- entities 里 time 用 ISO 8601，place 用地名。
- confidence 是你对理解本身的把握（0-1），不是事实的把握。
- 输出 JSON，包含 schema_version=1、id（intent_ 前缀）、conversation_id（conv_ 前缀）、
  goal、missing_fields、confidence、created_at（ISO 8601）。"""


@dataclass
class IntentOutcome:
    status: str                    # "understood" | "needs_clarification" | "unsupported"
    envelope: dict | None
    missing_fields: list[str] = field(default_factory=list)
    reason: str = ""
    used_repair: bool = False


class IntentUnderstanding:
    def __init__(self, generator: ConstrainedGenerator, clarify_threshold: float = 0.55):
        self.generator = generator
        self.clarify_threshold = clarify_threshold

    def understand(
        self,
        utterance: str,
        conversation_id: str,
        current_task_id: str | None,
        now: datetime,
        options: ModelCallOptions,
    ) -> IntentOutcome:
        tz = now.tzinfo or ZoneInfo("UTC")
        prompt = PROMPT_TEMPLATE.format(
            utterance=utterance,
            now=now.isoformat(timespec="seconds"),
            tz=str(tz),
            current_task=current_task_id or "（无）",
            task_types=", ".join(SUPPORTED_TASK_TYPES),
        )
        try:
            outcome = self.generator.generate(prompt, INTENT_SCHEMA, options)
        except ConstrainedOutputError as e:
            return IntentOutcome(
                status="needs_clarification",
                envelope=None,
                reason=f"我没能可靠地理解这句话（{e.schema_name} 校验未通过）。请换一种说法或补充关键信息。",
                used_repair=e.errors != [],
            )

        env = outcome.parsed
        confidence = float(env.get("confidence", 0.0))
        if confidence < self.clarify_threshold:
            return IntentOutcome(
                status="needs_clarification",
                envelope=env,
                missing_fields=list(env.get("missing_fields", [])) or ["具体要求"],
                reason="我还不确定你想办什么事。",
                used_repair=outcome.used_repair,
            )
        if env.get("task_type") == "unknown":
            return IntentOutcome(
                status="unsupported",
                envelope=env,
                reason="这个类型的事务我暂时还办不了。你可以选择保留为待办，或换个说法。",
            )
        return IntentOutcome(
            status="understood",
            envelope=env,
            missing_fields=list(env.get("missing_fields", [])),
            used_repair=outcome.used_repair,
        )
