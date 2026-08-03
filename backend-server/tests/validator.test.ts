import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Validator } from '../src/org-config/validator';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('Validator', () => {
  it('passes valid default config', () => {
    const v = new Validator();
    const result = v.validateYamlFile(join(__dirname, 'fixtures/valid-default.yaml'));
    expect(result.valid).toBe(true);
  });

  it('rejects config with empty name', () => {
    const v = new Validator();
    const result = v.validateRaw({
      version: '1.0',
      org: { name: '', departments: [{ name: 'Arch', roles: [{ name: 'lead', agentType: 'gp', bound_skill: 'x' }] }] },
      budget: {}
    });
    expect(result.valid).toBe(false);
    expect(result.errors[0].instancePath).toContain('/org/name');
  });

  it('rejects config with missing departments', () => {
    const v = new Validator();
    const result = v.validateRaw({ version: '1.0', org: { name: 'test' }, budget: {} });
    expect(result.valid).toBe(false);
  });

  it('rejects role with uppercase name pattern violation', () => {
    const v = new Validator();
    const result = v.validateRaw({
      version: '1.0',
      org: { name: 'test', departments: [{ name: 'Arch', roles: [{ name: 'Tech_Lead', agentType: 'gp', bound_skill: 'x' }] }] },
      budget: {}
    });
    expect(result.valid).toBe(false);
  });
});
