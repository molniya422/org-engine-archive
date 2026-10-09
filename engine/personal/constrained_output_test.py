"""P2.3 tests — constrained generation: repair once, then needs_clarification.

Key acceptance (plan P2.3): 随机破坏模型输出时，系统不会生成可执行的
ActionProposal — i.e. broken model output never becomes an actionable object.
"""

from __future__ import annotations

import json
import unittest

from personal.constrained_output import ConstrainedGenerator, ConstrainedOutputError
from personal.model_types import ModelCallOptions
from personal.providers.fake import FakeProvider, FakeResponse

OPTS = ModelCallOptions(model="fake-mini", temperature=0.0)

# A valid user-fact fixture from P1.1 (subset with all required keys).
VALID_FACT = {
    "schema_version": 1,
    "id": "fact_01",
    "kind": "schedule",
    "value": {"weekday": "friday"},
    "source_refs": ["evidence_01"],
    "confidence": 0.9,
    "valid_from": "2026-10-04T00:00:00Z",
    "valid_until": None,
    "sensitivity": "normal",
    "status": "active",
    "created_at": "2026-10-04T00:00:00Z",
    "updated_at": "2026-10-04T00:00:00Z",
}


def make_generator(script: dict) -> tuple[ConstrainedGenerator, FakeProvider]:
    p = FakeProvider(script)
    return ConstrainedGenerator(p), p


class TestConstrainedGeneration(unittest.TestCase):
    def test_valid_output_passes_without_repair(self):
        gen, p = make_generator({"fact": FakeResponse(json=VALID_FACT)})
        out = gen.generate("fact", "user-fact", OPTS)
        self.assertEqual(out.status, "ok")
        self.assertFalse(out.used_repair)
        self.assertEqual(out.parsed["kind"], "schedule")

    def test_invalid_then_repaired_output(self):
        # First call returns wrong enum; the repair prompt embeds the original
        # prompt AND the marker 校验错误, so script the fake on the marker
        # (it must be matched first — FakeProvider matches by substring scan).
        bad = {**VALID_FACT, "kind": "weather"}
        gen, p = make_generator({
            "校验错误": FakeResponse(json=VALID_FACT),   # repair call
        })
        p.script = {"fact": FakeResponse(json=bad), **p.script}
        # ensure marker wins on the repair prompt: FakeProvider scans in
        # insertion order, and dict re-assignment preserves insertion; place
        # the marker before 'fact' by rebuilding.
        p.script = {"校验错误": FakeResponse(json=VALID_FACT), "fact": FakeResponse(json=bad)}
        out = gen.generate("fact", "user-fact", OPTS)
        self.assertEqual(out.status, "repaired")
        self.assertTrue(out.used_repair)
        self.assertEqual(out.parsed["confidence"], 0.9)

    def test_repair_also_fails_needs_clarification_never_object(self):
        # Both attempts return invalid payloads.
        bad = {**VALID_FACT, "kind": "weather", "confidence": 5}
        gen, _ = make_generator({
            "fact": FakeResponse(json=bad),
            "校验错误": FakeResponse(json={"totally": "wrong"}),
        })
        with self.assertRaises(ConstrainedOutputError):
            gen.generate("fact", "user-fact", OPTS)

    def test_repair_json_break_needs_clarification(self):
        bad = {**VALID_FACT, "kind": "weather"}
        gen, _ = make_generator({
            "fact": FakeResponse(json=bad),
            "校验错误": FakeResponse(raw="{{{not json"),
        })
        with self.assertRaises(ConstrainedOutputError):
            gen.generate("fact", "user-fact", OPTS)

    def test_no_repair_without_first_failure(self):
        gen, p = make_generator({"fact": FakeResponse(json=VALID_FACT)})
        out = gen.generate("fact", "user-fact", OPTS)
        self.assertEqual(len(p.calls), 1)  # exactly one model call

    def test_repair_called_at_most_once(self):
        bad = {**VALID_FACT, "kind": "weather"}
        gen, p = make_generator({
            "fact": FakeResponse(json=bad),
            "校验错误": FakeResponse(json={"nope": 1}),
        })
        with self.assertRaises(ConstrainedOutputError):
            gen.generate("fact", "user-fact", OPTS)
        self.assertEqual(len(p.calls), 2)  # original + exactly one repair

    def test_repair_prompt_includes_errors(self):
        bad = {**VALID_FACT, "kind": "weather"}
        gen, p = make_generator({
            "校验错误": FakeResponse(json=VALID_FACT),
        })
        p.script = {"校验错误": FakeResponse(json=VALID_FACT), "fact": FakeResponse(json=bad)}
        gen.generate("fact", "user-fact", OPTS)
        repair_prompt = p.calls[1][0]
        self.assertIn("user-fact", repair_prompt)
        self.assertIn("kind", repair_prompt)  # the failing field is named

    def test_strict_required_and_additional_properties(self):
        gen, _ = make_generator({})
        # missing required
        missing = {k: v for k, v in VALID_FACT.items() if k != "confidence"}
        errs = gen._validate("user-fact", missing)
        self.assertTrue(any("confidence" in e for e in errs))
        # additional property
        extra = {**VALID_FACT, "extra_field": 1}
        errs = gen._validate("user-fact", extra)
        self.assertTrue(any("extra_field" in e for e in errs))

    def test_strict_enum_and_bounds(self):
        gen, _ = make_generator({})
        errs = gen._validate("user-fact", {**VALID_FACT, "confidence": 1.5})
        self.assertTrue(any("maximum" in e for e in errs))
        errs = gen._validate("user-fact", {**VALID_FACT, "status": "assumed"})
        self.assertTrue(any("enum" in e for e in errs))


if __name__ == "__main__":
    unittest.main()
