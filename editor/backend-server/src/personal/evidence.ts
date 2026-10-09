/**
 * P1.3 — Evidence rules (plan P1.3):
 *
 * 1. File evidence stores ONLY workspace-relative locators — never an
 *    unauthorized absolute path. (The schema already rejects `D:\...`;
 *    the service additionally normalizes and rejects absolute input.)
 * 2. Tool results keep a raw summary, hash, capture time, sensitivity.
 * 3. User statements are kind=user_statement and can NEVER be upgraded to
 *    an external fact — there is no API that mutates kind upward.
 * 4. Evidence chain query: any fact or decision traces to >=1 evidence.
 *
 * TS implementation here; Python twin in engine/personal/evidence.py with
 * identical rules and field names.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join, relative, isAbsolute, sep } from 'node:path';
import { PersonalStore } from './store';

export type EvidenceKind = 'file' | 'tool_result' | 'user_statement' | 'execution_receipt' | 'verification';
export type Sensitivity = 'normal' | 'sensitive' | 'high';

export interface EvidenceRecord {
  schema_version: 1;
  id: string;
  kind: EvidenceKind;
  locator: string;
  content_hash: string;
  captured_at: string;
  sensitivity: Sensitivity;
  supports: string[];
}

export class EvidenceRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EvidenceRuleError';
  }
}

function sha256(data: string): string {
  return `sha256:${createHash('sha256').update(data, 'utf8').digest('hex')}`;
}

function nowIso(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/**
 * Normalize a file locator into a workspace-relative path.
 * Throws when the path escapes the workspace or is absolute.
 */
export function toWorkspaceLocator(workspaceRoot: string, rawPath: string): string {
  if (isAbsolute(rawPath)) {
    throw new EvidenceRuleError(
      `file evidence must use a workspace-relative path, got absolute: ${rawPath}`,
    );
  }
  const rel = relative(workspaceRoot, join(workspaceRoot, rawPath));
  if (rel.startsWith('..') || isAbsolute(rel) || rel.split(sep)[0] === '..') {
    throw new EvidenceRuleError(
      `file evidence path escapes the workspace: ${rawPath}`,
    );
  }
  return rel.split(sep).join('/');
}

/**
 * The evidence service. All evidence writes for the personal domain go
 * through here so the four rules above cannot be bypassed.
 */
export class EvidenceRepository {
  constructor(
    private store: PersonalStore,
    private workspaceRoot: string,
  ) {}

  /** Rule 1: file evidence — workspace-relative locator only, hash of content. */
  fromFile(relativePath: string, opts: { sensitivity?: Sensitivity; supports?: string[]; id?: string } = {}): EvidenceRecord {
    const locator = toWorkspaceLocator(this.workspaceRoot, relativePath);
    let content = '';
    try {
      content = readFileSync(join(this.workspaceRoot, locator), 'utf-8');
    } catch (e) {
      throw new EvidenceRuleError(`cannot hash file evidence ${locator}: ${(e as Error).message}`);
    }
    const rec: EvidenceRecord = {
      schema_version: 1,
      id: opts.id ?? `evidence_file_${sha256(locator + content).slice(7, 23)}`,
      kind: 'file',
      locator,
      content_hash: sha256(content),
      captured_at: nowIso(),
      sensitivity: opts.sensitivity ?? 'normal',
      supports: opts.supports ?? [],
    };
    this.store.saveEvidence(rec);
    return rec;
  }

  /** Rule 2: tool result — summary + hash + capture time + sensitivity. */
  fromToolResult(toolName: string, summary: unknown, opts: { sensitivity?: Sensitivity; supports?: string[]; id?: string } = {}): EvidenceRecord {
    const serialized = JSON.stringify(summary ?? null);
    const rec: EvidenceRecord = {
      schema_version: 1,
      id: opts.id ?? `evidence_tool_${Date.now().toString(36)}`,
      kind: 'tool_result',
      locator: `tool://${toolName}`,
      content_hash: sha256(serialized),
      captured_at: nowIso(),
      sensitivity: opts.sensitivity ?? 'normal',
      supports: opts.supports ?? [],
    };
    this.store.saveEvidence(rec);
    return rec;
  }

  /**
   * Rule 3: user statement — always kind=user_statement. There is no
   * parameter, code path, or API in this class that can change the kind.
   */
  fromUserStatement(conversationId: string, utterance: string, opts: { supports?: string[]; id?: string } = {}): EvidenceRecord {
    const rec: EvidenceRecord = {
      schema_version: 1,
      id: opts.id ?? `evidence_user_${Date.now().toString(36)}`,
      kind: 'user_statement',
      locator: `conversation://${conversationId}`,
      content_hash: sha256(utterance),
      captured_at: nowIso(),
      sensitivity: 'normal',
      supports: opts.supports ?? [],
    };
    this.store.saveEvidence(rec);
    return rec;
  }

  get(id: string): EvidenceRecord | null {
    return this.store.getEvidence(id) as EvidenceRecord | null;
  }

  /** Rule 4: chain — evidence supporting a fact/decision/task ref. */
  chain(refId: string): EvidenceRecord[] {
    return this.store.evidenceChain(refId) as EvidenceRecord[];
  }
}

// -- test helpers exported for convenience ----------------------------------

export const __testHelpers = { sha256, nowIso };
