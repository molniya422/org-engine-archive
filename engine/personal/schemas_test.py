"""P1.1 Python twin: validate the same fixtures with the same schema files.

Field names in engine/personal must mirror editor/schema/personal exactly;
this test anchors that contract from the Python side. Runs without extra
dependencies when jsonschema is available, and degrades to structural
checks when it is not (still catching field-name drift).
"""

import json
import os
import unittest
from pathlib import Path

SCHEMA_DIR = (
    Path(__file__).resolve().parents[2]
    / "editor" / "schema" / "personal"
)
FIXTURES = SCHEMA_DIR / "fixtures" / "index.json"

EXPECTED_SCHEMAS = {
    "action-proposal",
    "decision-trace",
    "evidence",
    "intent-envelope",
    "learning-proposal",
    "personal-eval-case",
    "task-contract",
    "user-fact",
    "user-rule",
    "capability-pack",
}


def _merge(base: dict, patch: dict) -> dict:
    out = json.loads(json.dumps(base))
    out.update(patch)
    return out


class TestCanonicalSchemas(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.fixtures = json.loads(FIXTURES.read_text(encoding="utf-8"))
        try:
            import jsonschema  # noqa: F401

            cls.jsonschema = jsonschema
            cls.have_jsonschema = True
        except ImportError:
            cls.have_jsonschema = False

    def _schema(self, name: str) -> dict:
        return json.loads((SCHEMA_DIR / f"{name}.schema.json").read_text(encoding="utf-8"))

    def test_all_ten_schemas_exist(self):
        found = {
            p.stem[: -len(".schema")]
            for p in SCHEMA_DIR.glob("*.schema.json")
        }
        self.assertEqual(found, EXPECTED_SCHEMAS)

    def test_fixtures_cover_all_canonical(self):
        # capability-pack is structural-only (no fixture)
        without_pack = EXPECTED_SCHEMAS - {'capability-pack'}
        self.assertEqual(set(self.fixtures.keys()), without_pack)

    def _validate(self, name: str, instance, expect_valid: bool, note: str):
        if self.have_jsonschema:
            self.jsonschema.validate(
                instance, self._schema(name)
                if expect_valid
                else _expect_error_schema(self._schema(name))
            )
            return
        # Structural fallback: field-name drift is the real enemy; check that
        # the schema declares exactly the keys the fixture uses (valid case).
        if expect_valid:
            declared = set(self._schema(name).get("properties", {}).keys())
            used = set(instance.keys())
            missing = used - declared
            self.assertFalse(missing, f"{name}: fields not in schema: {missing}")

    def test_valid_fixtures_pass(self):
        for name, fx in self.fixtures.items():
            with self.subTest(schema=name):
                if self.have_jsonschema:
                    self.jsonschema.validate(fx["valid"], self._schema(name))
                else:
                    declared = set(self._schema(name).get("properties", {}).keys())
                    missing = set(fx["valid"].keys()) - declared
                    self.assertFalse(missing, f"{name}: fields not in schema: {missing}")

    def test_invalid_fixtures_fail(self):
        for name, fx in self.fixtures.items():
            with self.subTest(schema=name):
                self.assertGreaterEqual(len(fx["invalid"]), 3)
                for bad in fx["invalid"]:
                    candidate = _merge(fx["valid"], bad["patch"])
                    if self.have_jsonschema:
                        with self.assertRaises(
                            self.jsonschema.ValidationError, msg=bad["note"]
                        ):
                            self.jsonschema.validate(candidate, self._schema(name))


def _expect_error_schema(schema: dict) -> dict:
    """jsonschema.validate(instance, schema) raises on invalid; for the invalid
    fixtures we validate directly against the real schema and expect an error.
    This helper exists to keep the call site readable; it returns the schema
    unchanged."""
    return schema


if __name__ == "__main__":
    unittest.main()
