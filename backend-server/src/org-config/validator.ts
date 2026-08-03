import Ajv, { ErrorObject } from 'ajv';
import addFormats from 'ajv-formats';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parse } from 'yaml';

// In esbuild CJS bundle, __dirname is auto-provided; fallback to cwd for dev mode
const currentDir = typeof __dirname !== 'undefined' ? __dirname : process.cwd();

export interface ValidationResult {
  valid: boolean;
  errors: ErrorObject[];
}

export class Validator {
  private ajv: Ajv;
  private validate: ReturnType<Ajv['compile']>;

  constructor(schemaPath?: string) {
    // unicodeRegExp:true lets org.name use \p{L}/\p{N} so CJK org names validate
    this.ajv = new Ajv({ allErrors: true, useDefaults: true, validateSchema: false, unicodeRegExp: true });
    addFormats(this.ajv);

    // Try to find schema relative to project root
    let resolvedPath = schemaPath;
    if (!resolvedPath) {
      const cwd = process.cwd();
      const candidates = [
        join(cwd, 'schema', 'org-config.schema.json'),
        join(cwd, '..', 'schema', 'org-config.schema.json'),
        // Relative to bundled server.cjs location (packaged Electron app)
        join(currentDir, '../../schema/org-config.schema.json'),
      ];
      // Also check packaged Electron app resources
      const resourcesPath = (process as any).resourcesPath;
      if (resourcesPath) {
        candidates.push(join(resourcesPath, 'schema', 'org-config.schema.json'));
      }
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
