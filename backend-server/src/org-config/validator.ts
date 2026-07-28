import Ajv, { ErrorObject } from 'ajv';
import addFormats from 'ajv-formats';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';

export interface ValidationResult {
  valid: boolean;
  errors: ErrorObject[];
}

export class Validator {
  private ajv: Ajv;
  private validate: ReturnType<Ajv['compile']>;

  constructor(schemaPath?: string) {
    this.ajv = new Ajv({ allErrors: true, useDefaults: true, validateSchema: false });
    addFormats(this.ajv);

    // Try to find schema relative to project root
    let resolvedPath = schemaPath;
    if (!resolvedPath) {
      const cwd = process.cwd();
      const candidates = [
        join(cwd, 'schema', 'org-config.schema.json'),
        join(cwd, '..', 'schema', 'org-config.schema.json'),
      ];
      resolvedPath = candidates.find(p => existsSync(p)) || candidates[0];
    }

    const schema = JSON.parse(readFileSync(resolvedPath, 'utf-8'));
    this.validate = this.ajv.compile(schema);
  }

  validateYamlFile(filePath: string): ValidationResult {
    const raw = parse(readFileSync(filePath, 'utf-8'));
    return this.validateRaw(raw);
  }

  validateRaw(data: unknown): ValidationResult {
    const valid = this.validate(data) as boolean;
    return {
      valid,
      errors: valid ? [] : structuredClone(this.validate.errors ?? []),
    };
  }
}
