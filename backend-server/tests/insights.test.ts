import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readInsights } from '../src/insights.routes';

describe('insights', () => {
  it('returns empty collections when state dir does not exist', () => {
    const r = readInsights('/nonexistent/state/dir');
    expect(r.meetings).toEqual([]);
    expect(r.comm).toEqual([]);
    expect(r.products).toEqual([]);
  });

  it('reads meetings.jsonl and comm.jsonl', () => {
    const dir = mkdtempSync(join(tmpdir(), 'insights-'));
    writeFileSync(join(dir, 'meetings.jsonl'), JSON.stringify({ type: 'dept', cycle: 1 }) + '\n');
    writeFileSync(join(dir, 'comm.jsonl'), JSON.stringify({ sender: 'a', verdict: 'allow' }) + '\n');
    const r = readInsights(dir);
    expect(r.meetings.length).toBe(1);
    expect(r.meetings[0].type).toBe('dept');
    expect(r.comm.length).toBe(1);
    expect(r.comm[0].verdict).toBe('allow');
  });

  it('reads products.jsonl', () => {
    const dir = mkdtempSync(join(tmpdir(), 'insights-'));
    writeFileSync(join(dir, 'products.jsonl'), JSON.stringify({ kind: 'allow', role: 'arch', key: 'k1' }) + '\n');
    const r = readInsights(dir);
    expect(r.products).toEqual([{ kind: 'allow', role: 'arch', key: 'k1' }]);
  });

  it('tolerates malformed JSONL lines', () => {
    const dir = mkdtempSync(join(tmpdir(), 'insights-'));
    writeFileSync(join(dir, 'meetings.jsonl'), 'bad\n{"type":"ok"}\n');
    const r = readInsights(dir);
    expect(r.meetings.length).toBe(1);
    expect(r.meetings[0].type).toBe('ok');
  });
});
