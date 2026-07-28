import { Validator, ValidationResult } from './validator';
import { readOrgConfig, writeOrgConfig, listOrgConfigs, deleteOrgConfig } from './yaml-io';

export interface OrgMeta {
  id: string;
  name: string;
  deptCount: number;
  roleCount: number;
}

export class SchemaValidationError extends Error {
  constructor(public errors: unknown[]) {
    super(`Schema validation failed with ${errors.length} error(s)`);
    this.name = 'SchemaValidationError';
  }
}

export class OrgConfigStore {
  private validator: Validator;

  constructor() { this.validator = new Validator(); }

  list(): OrgMeta[] {
    const ids = listOrgConfigs();
    return ids.map(id => {
      const data = readOrgConfig(id) as any;
      const depts = data?.org?.departments ?? [];
      const roles = depts.flatMap((d: any) => d.roles ?? []);
      return { id, name: data?.org?.name ?? id, deptCount: depts.length, roleCount: roles.length };
    });
  }

  get(id: string): unknown { return readOrgConfig(id); }

  save(id: string, data: unknown): void {
    const result = this.validator.validateRaw(data);
    if (!result.valid) throw new SchemaValidationError(result.errors);
    writeOrgConfig(id, data);
  }

  delete(id: string): void { deleteOrgConfig(id); }

  validateRaw(data: unknown): ValidationResult { return this.validator.validateRaw(data); }
}
