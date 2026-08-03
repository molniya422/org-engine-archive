import { WorkflowValidator, ValidationResult } from './validator';
import { readWorkflowConfig, writeWorkflowConfig, listWorkflowConfigs, deleteWorkflowConfig } from './yaml-io';
import { readOrgConfig, listOrgConfigs } from '../org-config/yaml-io';

export class WorkflowSchemaValidationError extends Error {
  constructor(public errors: unknown[]) {
    super(`Workflow validation failed with ${errors.length} error(s)`);
    this.name = 'WorkflowSchemaValidationError';
  }
}

export class WorkflowConfigStore {
  private createValidator(): WorkflowValidator {
    // Build org role id set from ALL current org configs
    const orgRoles = new Set<string>();
    for (const id of listOrgConfigs()) {
      const cfg = readOrgConfig(id) as any;
      for (const d of cfg?.org?.departments ?? []) {
        for (const r of d?.roles ?? []) {
          if (r?.id) orgRoles.add(r.id);
        }
      }
    }
    return new WorkflowValidator((ref: string) => orgRoles.has(ref));
  }

  list(): string[] { return listWorkflowConfigs(); }

  get(id: string): unknown { return readWorkflowConfig(id); }

  save(id: string, data: unknown): void {
    const validator = this.createValidator();
    const r = validator.validateRaw(data);
    if (!r.valid) throw new WorkflowSchemaValidationError(r.errors);
    writeWorkflowConfig(id, data);
  }

  delete(id: string): void { deleteWorkflowConfig(id); }

  validate(data: unknown): { valid: boolean; errors: any[] } {
    return this.createValidator().validateRaw(data);
  }
}
