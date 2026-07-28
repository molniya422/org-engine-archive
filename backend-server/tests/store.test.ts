import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SchemaValidationError } from '../src/org-config/store';

describe('Store validation', () => {
  it('rejects invalid config', async () => {
    // Direct validator test (store needs fs)
    const { Validator } = await import('../src/org-config/validator');
    const v = new Validator();
    const result = v.validateRaw({ version: '1.0', org: { name: 'test' } });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('rejects config with empty org name', async () => {
    const { Validator } = await import('../src/org-config/validator');
    const v = new Validator();
    const result = v.validateRaw({
      version: '1.0',
      org: { name: '', departments: [{ name: 'Arch', roles: [{ name: 'lead', agentType: 'gp', bound_skill: 'x' }] }] },
      budget: {}
    });
    expect(result.valid).toBe(false);
  });

  it('accepts valid default config', async () => {
    const { readFileSync, existsSync } = await import('node:fs');
    const { join } = await import('node:path');
    const yaml = await import('yaml');
    const { Validator } = await import('../src/org-config/validator');

    // Find default-org.yaml
    const cwd = process.cwd();
    const defaultPath = ['./examples/default-org.yaml', '../examples/default-org.yaml', '../../examples/default-org.yaml']
      .map(p => join(cwd, p))
      .find(p => existsSync(p));

    if (!defaultPath) throw new Error('default-org.yaml not found');

    const v = new Validator();
    const result = v.validateYamlFile(defaultPath);
    expect(result.valid).toBe(true);
  });
});
