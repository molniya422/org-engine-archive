import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import Fastify from 'fastify';
import { PersonalStore } from '../src/personal/store';
import { registerRuleEngineRoutes, ruleOutcomeFor } from '../src/personal/rule.routes';

const TMP = join(process.cwd(), '.tmp-personal-rules');

function rmRf(p: string): void {
  try { rmSync(p, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }); } catch { /* windows */ }
}

beforeEach(() => rmRf(TMP));
afterAll(() => rmRf(TMP));

const DENY_SEND = {
  schema_version: 1,
  id: 'rule_deny_send',
  when: { event: 'external_send', scope: 'all' },
  then: { action: 'deny' },
  priority: 100,
  source: 'user_explicit',
  status: 'active',
  version: 1,
};

describe('P3.4 rule engine routes (TS mirror)', () => {
  it('ruleOutcomeFor: deny wins over allow at any priority', () => {
    const rules = [
      { id: 'lo', when: { event: 'external_send' }, then: { action: 'allow' }, priority: 1, status: 'active' },
      { id: 'hi', when: { event: 'external_send' }, then: { action: 'deny' }, priority: 5, status: 'active' },
    ];
    expect(ruleOutcomeFor(rules as never, 'external_send', '').outcome).toBe('blocked');
  });

  it('ruleOutcomeFor: high-risk default requires confirmation with no rules', () => {
    const v = ruleOutcomeFor([], 'payment', '');
    expect(v.outcome).toBe('require_confirmation');
  });

  it('blocked is the final word: model preference has no input path', () => {
    // ruleOutcomeFor takes only (rules, kind, target) — there is no parameter
    // a model could use to weaken the outcome.
    const fn = ruleOutcomeFor.length;
    expect(fn).toBe(3);
  });

  it('POST /rules/:id/check reports the engine verdict from stored rules', async () => {
    const store = new PersonalStore({ dbPath: join(TMP, 'p.sqlite') });
    store.saveRule(DENY_SEND);
    const app = Fastify({ logger: false });
    registerRuleEngineRoutes(app, store);
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/personal/rules/rule_deny_send/check',
      payload: { kind: 'external_send', target: 'x@example.com' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.outcome).toBe('blocked');
    expect(body.matched).toContain('rule_deny_send');
    app.close();
    store.close();
  });

  it('unrelated kind falls back to high-risk default', async () => {
    const store = new PersonalStore({ dbPath: join(TMP, 'q.sqlite') });
    store.saveRule(DENY_SEND);
    const app = Fastify({ logger: false });
    registerRuleEngineRoutes(app, store);
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/personal/rules/rule_deny_send/check',
      payload: { kind: 'payment' },
    });
    expect(res.json().outcome).toBe('require_confirmation');
    app.close();
    store.close();
  });
});
