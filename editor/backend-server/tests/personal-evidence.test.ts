import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { PersonalStore } from '../src/personal/store';
import {
  EvidenceRepository,
  EvidenceRuleError,
  toWorkspaceLocator,
} from '../src/personal/evidence';

const TMP = join(process.cwd(), '.tmp-personal-evidence');
const WORKSPACE = join(TMP, 'workspace');

function rmRf(p: string): void {
  try { rmSync(p, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }); } catch { /* windows */ }
}

beforeEach(() => {
  rmRf(TMP);
  mkdirSync(join(WORKSPACE, 'inbox'), { recursive: true });
  writeFileSync(join(WORKSPACE, 'inbox', 'a.pdf'), 'A4 报销单，3 页扫描');
});

afterAll(() => rmRf(TMP));

function makeRepo(): { store: PersonalStore; repo: EvidenceRepository } {
  const store = new PersonalStore({ dbPath: join(TMP, 'personal.sqlite') });
  return { store, repo: new EvidenceRepository(store, WORKSPACE) };
}

describe('P1.3 evidence rules', () => {
  it('rule 1: file evidence stores a workspace-relative locator + content hash', () => {
    const { store, repo } = makeRepo();
    const rec = repo.fromFile('inbox/a.pdf');
    expect(rec.kind).toBe('file');
    expect(rec.locator).toBe('inbox/a.pdf');
    expect(rec.content_hash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(store.getEvidence(rec.id)).not.toBeNull();
    store.close();
  });

  it('rule 1: rejects absolute paths — no unauthorized filesystem leak', () => {
    const { store, repo } = makeRepo();
    expect(() => repo.fromFile('D:\\secrets\\salary.pdf')).toThrow(EvidenceRuleError);
    expect(() => repo.fromFile('/etc/passwd')).toThrow(EvidenceRuleError);
    // also rejects traversal that escapes the workspace
    expect(() => repo.fromFile('../outside.txt')).toThrow(EvidenceRuleError);
    store.close();
  });

  it('rule 2: tool results keep summary hash + capture time + sensitivity', () => {
    const { repo } = makeRepo();
    const rec = repo.fromToolResult('read_file', { pages: 3, ok: true }, { sensitivity: 'sensitive' });
    expect(rec.kind).toBe('tool_result');
    expect(rec.locator).toBe('tool://read_file');
    expect(rec.content_hash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(rec.captured_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    expect(rec.sensitivity).toBe('sensitive');
  });

  it('rule 3: user statements are user_statement and cannot be upgraded', () => {
    const { store, repo } = makeRepo();
    const rec = repo.fromUserStatement('conv_01', '我每周五去健身房');
    expect(rec.kind).toBe('user_statement');
    // The record shape has no kind field that can be mutated to file/tool_result
    // and the repository exposes no upgrade path. Read-back must be identical.
    const back = store.getEvidence(rec.id);
    expect(back?.kind).toBe('user_statement');
    store.close();
  });

  it('rule 4: evidence chain query finds supporting evidence for a ref', () => {
    const { repo } = makeRepo();
    repo.fromFile('inbox/a.pdf', { supports: ['fact_01'] });
    repo.fromUserStatement('conv_01', '另外一条无关的话');
    const chain = repo.chain('fact_01');
    expect(chain).toHaveLength(1);
    expect(chain[0].locator).toBe('inbox/a.pdf');
  });

  it('every fact can be traced to evidence, or is explicitly user input', () => {
    const { store, repo } = makeRepo();
    // fact backed by file evidence
    const ev = repo.fromFile('inbox/a.pdf', { supports: ['fact_77'] });
    store.saveFact({
      schema_version: 1,
      id: 'fact_77',
      kind: 'finance',
      value: { label: '报销单' },
      source_refs: [ev.id],
      confidence: 1,
      valid_from: '2026-10-09T00:00:00Z',
      valid_until: null,
      sensitivity: 'normal',
      status: 'active',
      created_at: '2026-10-09T00:00:00Z',
      updated_at: '2026-10-09T00:00:00Z',
    });
    const fact = store.getFact('fact_77');
    const chain = repo.chain('fact_77');
    expect(fact?.source_refs.length).toBeGreaterThanOrEqual(1);
    expect(chain.length).toBeGreaterThanOrEqual(1);
    expect(chain[0].id).toBe(ev.id);
    store.close();
  });

  it('toWorkspaceLocator normalizes separators', () => {
    expect(toWorkspaceLocator(WORKSPACE, 'inbox\\a.pdf')).toBe('inbox/a.pdf');
    expect(toWorkspaceLocator(WORKSPACE, './inbox/a.pdf')).toBe('inbox/a.pdf');
  });
});
