/**
 * Tests for PersonalDecisionProtocol (Octop tool receipt mapping).
 * Uses the shared fixture at editor/docs/integration/fixtures/octop-tool-receipt.json
 * plus inline cases for tolerance and invalid-input behaviour.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import {
  PROTOCOL_VERSION,
  ProtocolMappingError,
  isToolReceipt,
  isError,
  protocolVersion,
  toPersonalEvidence,
  toToolReceipt,
  toolName,
} from '../src/personal/protocol';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = path.resolve(
  __dirname,
  '..',
  '..',
  'docs',
  'integration',
  'fixtures',
  'octop-tool-receipt.json',
);

interface Fixture {
  $comment?: string;
  octop_version: string;
  events: Array<Record<string, unknown>>;
}

function loadFixture(): Fixture {
  return JSON.parse(readFileSync(FIXTURE_PATH, 'utf-8')) as Fixture;
}

function event(eventId: string): Record<string, unknown> {
  const ev = loadFixture().events.find((e) => e.event_id === eventId);
  if (!ev) throw new Error(`fixture event ${eventId} not found`);
  return ev;
}

const SHA256_RE = /^sha256:[0-9a-f]{64}$/;
const ISO_Z_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

describe('PersonalDecisionProtocol', () => {
  describe('happy path: success / failure / cancellation', () => {
    it('maps a successful read_file receipt to Evidence', () => {
      const receipt = toToolReceipt(event('ev_read_file_001'));
      expect(receipt.protocol_version).toBe(PROTOCOL_VERSION);
      expect(receipt.tool_name).toBe('read_file');
      expect(receipt.is_error).toBe(false);
      expect(receipt.call_id).toBe('call_0d1e');
      expect(receipt.args).toEqual({ path: 'workspace/inbox/a.pdf' });
      expect(receipt.result).toEqual({
        content: 'A4 报销单，含 3 页扫描，抬头为 2026-10 差旅报销。',
        mime: 'application/pdf',
        pages: 3,
      });
      expect(isError(receipt)).toBe(false);
      expect(toolName(receipt)).toBe('read_file');
      expect(protocolVersion()).toBe(PROTOCOL_VERSION);

      const evidence = toPersonalEvidence(receipt);
      expect(evidence.id).toBe('evidence_octop_ev_read_file_001');
      expect(evidence.kind).toBe('tool_result');
      expect(evidence.locator).toBe(
        'octop://trajectory/personal-assistant/thr_inbox_0421/ev_read_file_001',
      );
      expect(evidence.content_hash).toMatch(SHA256_RE);
      expect(evidence.captured_at).toBe('2025-10-10T02:40:00Z');
      expect(evidence.captured_at).toMatch(ISO_Z_RE);
      expect(evidence.sensitivity).toBe('normal');
      expect(evidence.supports).toEqual([]);
    });

    it('maps a failed external_send receipt (is_error=true) to Evidence', () => {
      const receipt = toToolReceipt(event('ev_external_send_002'));
      expect(receipt.is_error).toBe(true);
      expect(receipt.tool_name).toBe('external_send');
      expect(receipt.result).toEqual({
        error: 'smtp timeout after 10s',
        status: 'failed',
      });
      expect(isError(receipt)).toBe(true);

      const evidence = toPersonalEvidence(receipt);
      expect(evidence.id).toBe('evidence_octop_ev_external_send_002');
      // Errored receipts still produce evidence; the RuleEngine decides gating.
      expect(evidence.content_hash).toMatch(SHA256_RE);
    });

    it('tolerates a cancelled receipt whose payload has no result key', () => {
      const receipt = toToolReceipt(event('ev_external_send_003'));
      // No "result" key -> normalized to null, not an exception.
      expect(receipt.result).toBeNull();
      expect(receipt.is_error).toBe(true);
      expect(receipt.tool_name).toBe('external_send');
      expect(receipt.args).toEqual({
        to: 'reimburse@example.com',
        subject: '2026-10 报销单',
      });

      const evidence = toPersonalEvidence(receipt);
      expect(evidence.id).toBe('evidence_octop_ev_external_send_003');
      expect(evidence.content_hash).toMatch(SHA256_RE);
    });
  });

  describe('tolerance and determinism', () => {
    it('tolerates a payload with no name field (tool_name -> "")', () => {
      const event0 = {
        event_id: 'ev_anon',
        thread_id: 't',
        agent_id: 'a',
        seq: 1,
        ts: 1700000000.0,
        kind: 'tool',
        is_error: false,
        summary: '',
        payload: { call_id: 'x', args: { p: 1 } },
      };
      const receipt = toToolReceipt(event0);
      expect(receipt.tool_name).toBe('');
      expect(receipt.args).toEqual({ p: 1 });
      expect(receipt.result).toBeNull();
      expect(receipt.is_error).toBe(false);
    });

    it('tolerates a tool event with no payload field at all', () => {
      const event0 = {
        event_id: 'ev_nopayload',
        thread_id: 't',
        agent_id: 'a',
        seq: 2,
        ts: 1700000001.0,
        kind: 'tool',
        is_error: false,
        summary: '',
      };
      const receipt = toToolReceipt(event0);
      expect(receipt.raw_payload).toEqual({});
      expect(receipt.tool_name).toBe('');
      expect(receipt.call_id).toBeNull();
    });

    it('produces deterministic content_hash that changes with result', () => {
      const base = {
        event_id: 'ev_determ',
        thread_id: 't',
        agent_id: 'a',
        seq: 3,
        ts: 1700000002.0,
        kind: 'tool',
        is_error: false,
        summary: '',
        payload: { name: 'read_file', args: { path: 'x' }, result: { ok: true } },
      };
      const r1 = toToolReceipt(base);
      const r2 = toToolReceipt(base);
      expect(toPersonalEvidence(r1).content_hash).toBe(
        toPersonalEvidence(r2).content_hash,
      );

      const changed = { ...base, payload: { ...base.payload, result: { ok: false } } };
      const r3 = toToolReceipt(changed);
      expect(toPersonalEvidence(r3).content_hash).not.toBe(
        toPersonalEvidence(r1).content_hash,
      );
    });
  });

  describe('invalid input raises ProtocolMappingError', () => {
    it.each([null, 'not-a-dict', 42, [1, 2, 3]])('rejects %s', (bad) => {
      expect(() => toToolReceipt(bad)).toThrow(ProtocolMappingError);
    });

    it('rejects kind !== "tool"', () => {
      const event0 = {
        event_id: 'ev_user',
        thread_id: 't',
        agent_id: 'a',
        seq: 1,
        ts: 1700000000.0,
        kind: 'user',
        is_error: false,
        summary: '',
        payload: {},
      };
      expect(() => toToolReceipt(event0)).toThrow(/kind="tool"/);
    });

    it('rejects missing event_id', () => {
      const event0 = {
        thread_id: 't',
        agent_id: 'a',
        seq: 1,
        ts: 1700000000.0,
        kind: 'tool',
        is_error: false,
        summary: '',
        payload: {},
      };
      expect(() => toToolReceipt(event0)).toThrow(/event_id/);
    });

    it('rejects non-string event_id', () => {
      const event0 = {
        event_id: 123,
        thread_id: 't',
        agent_id: 'a',
        seq: 1,
        ts: 1700000000.0,
        kind: 'tool',
        is_error: false,
        summary: '',
        payload: {},
      };
      expect(() => toToolReceipt(event0)).toThrow(/event_id/);
    });

    it('rejects non-finite ts (NaN)', () => {
      const event0 = {
        event_id: 'ev',
        thread_id: 't',
        agent_id: 'a',
        seq: 1,
        ts: Number.NaN,
        kind: 'tool',
        is_error: false,
        summary: '',
        payload: {},
      };
      expect(() => toToolReceipt(event0)).toThrow(/ts/);
    });

    it('rejects a non-object payload', () => {
      const event0 = {
        event_id: 'ev',
        thread_id: 't',
        agent_id: 'a',
        seq: 1,
        ts: 1700000000.0,
        kind: 'tool',
        is_error: false,
        summary: '',
        payload: 'not-a-dict',
      };
      expect(() => toToolReceipt(event0)).toThrow(/payload/);
    });
  });

  describe('isToolReceipt type guard', () => {
    it('returns true for a kind="tool" event', () => {
      expect(isToolReceipt(event('ev_read_file_001'))).toBe(true);
    });

    it('returns false for non-tool events and non-objects', () => {
      expect(isToolReceipt({ kind: 'user' })).toBe(false);
      expect(isToolReceipt(null)).toBe(false);
      expect(isToolReceipt({})).toBe(false);
      expect(isToolReceipt('tool')).toBe(false);
    });
  });

  describe('data sovereignty', () => {
    it('TS and Python twins produce the same content_hash (parity anchor)', () => {
      // Reference hash computed by the Python twin (octop.py) for the success
      // fixture. Kept as a parity anchor so the two implementations cannot
      // silently drift their canonicalization.
      const receipt = toToolReceipt(event('ev_read_file_001'));
      const evidence = toPersonalEvidence(receipt);
      expect(evidence.content_hash).toMatch(SHA256_RE);
      expect(evidence.content_hash).toBe(
        'sha256:7d13f69160451b95a776579ff93335534d9f99324359306ca22f0f807d64ba19',
      );
    });
  });
});
