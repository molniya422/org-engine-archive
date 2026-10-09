"""P2.3 — constrained generation.

Wraps LocalModelProvider.generate_json with schema-bound validation and the
one-repair-then-clarify policy (plan P2.3):

1. Output must validate against the named JSON Schema (editor/schema/personal/).
2. enum / required / additionalProperties violations are strict — no coercion,
   no defaults invented here.
3. On an invalid output the model gets exactly ONE repair attempt, with the
   validation errors included in the repair prompt.
4. If the repair also fails, the outcome is needs_clarification — never an
   executable ActionProposal, never a guessed field.

This module is the ONLY path from model output to intent/task/plan objects.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from enum import Enum
from pathlib import Path
from typing import Any

from .model_provider import LocalModelProvider
from .model_types import ModelCallOptions, ModelOutputError

SCHEMA_DIR = (
    Path(__file__).resolve().parents[2] / "editor" / "schema" / "personal"
)


class ConstrainedOutputError(Exception):
    """Schema not satisfiable after the single repair attempt.

    Callers MUST translate this into needs_clarification — the plan forbids
    executing anything on a failed constrained generation.
    """

    def __init__(self, schema_name: str, errors: list[str], raw: str | None):
        super().__init__(
            f"constrained generation failed for schema '{schema_name}': "
            + "; ".join(errors[:5])
        )
        self.schema_name = schema_name
        self.errors = errors
        self.raw = raw


@dataclass
class GenerationOutcome:
    status: str               # "ok" | "repaired" | "needs_clarification"
    parsed: Any | None
    used_repair: bool
    raw: str
    schema_name: str


class ConstrainedGenerator:
    def __init__(self, provider: LocalModelProvider, schema_dir: Path | None = None):
        self.provider = provider
        self.schema_dir = schema_dir or SCHEMA_DIR
        self._cache: dict[str, dict] = {}

    def _schema(self, name: str) -> dict:
        if name not in self._cache:
            path = self.schema_dir / f"{name}.schema.json"
            self._cache[name] = json.loads(path.read_text(encoding="utf-8"))
        return self._cache[name]

    def _validate(self, schema_name: str, value: Any) -> list[str]:
        """Strict structural validation without external deps.

        Checks the failure modes the plan names: enum membership, required
        keys, additionalProperties, and top-level type. Deep validation is
        the Ajv/jsonschema layer's job (P1.1 tests cover it); this check runs
        at generation time to decide repair vs clarify.
        """
        schema = self._schema(schema_name)
        errors: list[str] = []
        self._validate_node("", value, schema, errors)
        return errors

    def _validate_node(self, path: str, value: Any, schema: dict, errors: list[str]) -> None:
        # type
        expected = schema.get("type")
        if expected is not None:
            types = expected if isinstance(expected, list) else [expected]
            checks = {
                "object": lambda v: isinstance(v, dict),
                "array": lambda v: isinstance(v, list),
                "string": lambda v: isinstance(v, str),
                "integer": lambda v: isinstance(v, int) and not isinstance(v, bool),
                "number": lambda v: isinstance(v, (int, float)) and not isinstance(v, bool),
                "boolean": lambda v: isinstance(v, bool),
                "null": lambda v: v is None,
            }
            if not any(checks[t](value) for t in types if t in checks):
                errors.append(f"{path or 'root'}: expected type {expected}, got {type(value).__name__}")
                return  # further checks on this node are meaningless
        # enum
        if "enum" in schema and value not in schema["enum"]:
            errors.append(f"{path or 'root'}: {value!r} not in enum {schema['enum']}")
        # const
        if "const" in schema and value != schema["const"]:
            errors.append(f"{path or 'root'}: expected const {schema['const']!r}, got {value!r}")
        # minimum / maximum
        if isinstance(value, (int, float)) and not isinstance(value, bool):
            if "minimum" in schema and value < schema["minimum"]:
                errors.append(f"{path or 'root'}: {value} < minimum {schema['minimum']}")
            if "maximum" in schema and value > schema["maximum"]:
                errors.append(f"{path or 'root'}: {value} > maximum {schema['maximum']}")
        # object checks
        if isinstance(value, dict):
            for req in schema.get("required", []):
                if req not in value:
                    errors.append(f"{path or 'root'}: missing required property '{req}'")
            props = schema.get("properties", {})
            if schema.get("additionalProperties") is False:
                for key in value:
                    if key not in props:
                        errors.append(f"{path or 'root'}: additional property '{key}' not allowed")
            for key, sub in props.items():
                if key in value:
                    self._validate_node(f"{path}.{key}".lstrip("."), value[key], sub, errors)
            for i, sub in enumerate(schema.get("allOf", [])):
                self._validate_node(path, value, sub, errors)
        # array checks
        if isinstance(value, list):
            if "minItems" in schema and len(value) < schema["minItems"]:
                errors.append(f"{path or 'root'}: needs >= {schema['minItems']} items, got {len(value)}")
            item_schema = schema.get("items")
            if item_schema:
                for i, item in enumerate(value):
                    self._validate_node(f"{path}[{i}]", item, item_schema, errors)

    def generate(
        self,
        prompt: str,
        schema_name: str,
        options: ModelCallOptions,
    ) -> GenerationOutcome:
        """Generate, validate, repair once, then give up into needs_clarification."""
        opts = ModelCallOptions(
            model=options.model,
            schema_name=schema_name,
            trace_id=options.trace_id,
            temperature=options.temperature,
            timeout_ms=options.timeout_ms,
            max_tokens=options.max_tokens,
        )
        result = self.provider.generate_json(prompt, opts)
        errors = self._validate(schema_name, result.parsed)
        if not errors:
            return GenerationOutcome("ok", result.parsed, used_repair=False, raw=result.text, schema_name=schema_name)

        # -- one repair attempt -------------------------------------------------
        repair_prompt = (
            f"{prompt}\n\n你上一次的输出不符合 JSON Schema '{schema_name}'。\n"
            f"校验错误：\n- " + "\n- ".join(errors[:10]) +
            f"\n你上一次的输出：\n{result.text}\n"
            f"请只输出修正后的 JSON，不要任何解释。"
        )
        try:
            repair = self.provider.generate_json(repair_prompt, opts)
        except ModelOutputError as e:
            return GenerationOutcome(
                "needs_clarification", None, used_repair=True, raw=result.text,
                schema_name=schema_name,
            )
        repair_errors = self._validate(schema_name, repair.parsed)
        if not repair_errors:
            return GenerationOutcome("repaired", repair.parsed, used_repair=True, raw=repair.text, schema_name=schema_name)
        raise ConstrainedOutputError(schema_name, errors + repair_errors[:3], raw=repair.text)
