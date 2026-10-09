/**
 * P1.1 — canonical personal schemas must validate their fixtures.
 *
 * Every schema is the single source of truth for field names: the TypeScript
 * backend (src/personal/*) and the Python engine (engine/personal/*) both
 * implement these names. The Python twin test (engine/personal/schemas_test.py)
 * validates the same fixtures with the same files.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';

const SCHEMA_DIR = join(__dirname, '..', '..', 'schema', 'personal');
const FIXTURES = JSON.parse(
  readFileSync(join(SCHEMA_DIR, 'fixtures', 'index.json'), 'utf-8'),
) as Record<string, { valid: object; invalid: Array<{ note: string; patch: object }> }>;

function loadSchemas() {
  const ajv = new Ajv2020({ strict: false, allErrors: true });
  addFormats(ajv);
  const validators: Record<string, ReturnType<typeof ajv.compile>> = {};
  for (const f of readdirSync(SCHEMA_DIR)) {
    if (!f.endsWith('.schema.json')) continue;
    const name = f.replace('.schema.json', '');
    const schema = JSON.parse(readFileSync(join(SCHEMA_DIR, f), 'utf-8'));
    validators[name] = ajv.compile(schema);
  }
  return validators;
}

describe('P1.1 canonical personal schemas', () => {
  const validators = loadSchemas();

  it('loads all canonical schemas', () => {
    expect(Object.keys(validators).sort()).toEqual([
      'action-proposal',
      'capability-pack',
      'decision-trace',
      'evidence',
      'intent-envelope',
      'learning-proposal',
      'personal-eval-case',
      'task-contract',
      'user-fact',
      'user-rule',
    ]);
  });

  for (const [name, fx] of Object.entries(FIXTURES)) {
    describe(name, () => {
      const validate = validators[name];
      if (!validate) throw new Error(`no schema loaded for ${name}`);

      it('accepts the valid fixture', () => {
        const ok = validate(fx.valid);
        if (!ok) throw new Error(`valid fixture rejected: ${JSON.stringify(validate.errors)}`);
        expect(ok).toBe(true);
      });

      it('rejects every invalid fixture with a useful error', () => {
        expect(fx.invalid.length).toBeGreaterThanOrEqual(3);
        for (const bad of fx.invalid) {
          const candidate = deepMerge(fx.valid, bad.patch);
          const ok = validate(candidate);
          expect(ok).toBe(false); // must reject
          expect(validate.errors?.length ?? 0).toBeGreaterThan(0);
        }
      });
    });
  }
});

function deepMerge<T extends object>(base: T, patch: object): T {
  const out: Record<string, unknown> = structuredClone(base as object);
  for (const [k, v] of Object.entries(patch)) out[k] = v;
  return out as T;
}
