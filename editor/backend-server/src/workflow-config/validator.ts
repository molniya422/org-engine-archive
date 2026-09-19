import Ajv, { ErrorObject } from 'ajv';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';

export interface ValidationResult {
  valid: boolean;
  errors: ErrorObject[];
}

// In esbuild CJS bundle, __dirname is auto-provided; fallback to cwd for dev mode
const currentDir = typeof __dirname !== 'undefined' ? __dirname : process.cwd();

export class WorkflowValidator {
  private ajv: Ajv;
  private validate: ReturnType<Ajv['compile']>;
  private orgRoleLookup: (ref: string) => boolean;

  constructor(orgRoleLookup: (ref: string) => boolean, schemaPath?: string) {
    this.ajv = new Ajv({ allErrors: true, useDefaults: true, validateSchema: false });
    this.orgRoleLookup = orgRoleLookup;

    let resolved = schemaPath;
    if (!resolved) {
      const cwd = process.cwd();
      const candidates = [
        join(cwd, 'schema', 'workflow-config.schema.json'),
        join(cwd, '..', 'schema', 'workflow-config.schema.json'),
        // Relative to bundled server.cjs location (packaged Electron app)
        join(currentDir, '../../schema/workflow-config.schema.json'),
      ];
      // Also check packaged Electron app resources
      const resourcesPath = (process as any).resourcesPath;
      if (resourcesPath) candidates.push(join(resourcesPath, 'schema', 'workflow-config.schema.json'));
      resolved = candidates.find(p => existsSync(p)) || candidates[0];
    }

    this.validate = this.ajv.compile(JSON.parse(readFileSync(resolved, 'utf-8')));
  }

  validateRaw(data: unknown): ValidationResult {
    const valid = this.validate(data) as boolean;
    if (!valid) return { valid, errors: structuredClone(this.validate.errors ?? []) };
    const errors: ErrorObject[] = [];
    for (const n of (data as any).nodes ?? []) {
      if (n.role_ref && !this.orgRoleLookup(n.role_ref)) {
        errors.push({
          keyword: 'invalidRoleRef',
          instancePath: `/nodes/${(data as any).nodes.indexOf(n)}/role_ref`,
          schemaPath: '#/$defs/node/properties/role_ref',
          params: { roleRef: n.role_ref },
          message: `unknown role_ref: ${n.role_ref}`,
        });
      }
      const acl = n.channel?.acl;
      for (const key of ['read', 'write'] as const) {
        for (const ref of acl?.[key] ?? []) {
          if (!this.orgRoleLookup(ref)) {
            errors.push({
              keyword: 'invalidAclRef',
              instancePath: `/nodes/${(data as any).nodes.indexOf(n)}/channel/acl/${key}`,
              schemaPath: '#/$defs/node/properties/channel/properties/acl',
              params: { aclKey: key, ref },
              message: `unknown acl ${key} ref: ${ref}`,
            });
          }
        }
      }
    }
    return errors.length ? { valid: false, errors } : { valid: true, errors: [] };
  }
}
