/**
 * P3.4 (TS side) — personal rule CRUD + engine-rule listing.
 *
 * The Python RuleEngine (engine/personal/rules.py) is the enforcement point;
 * these routes manage the user's rules (GET/POST/PATCH already in P1.4) and
 * additionally expose POST /personal/rules/:id/check for the backend to ask
 * "what would the engine say about this candidate action?" during planning.
 * The check mirrors the Python strictness ladder exactly.
 */
import { FastifyInstance } from 'fastify';
import { PersonalStore } from './store';

const STRICTNESS: Record<string, number> = {
  allow: 0,
  require_confirmation: 1,
  redact_and_confirm: 2,
  deny: 3,
};

const HIGH_RISK_KINDS = new Set(['external_send', 'delete', 'submit', 'payment']);

export interface EngineRuleRow {
  id: string;
  when: { event: string; scope?: string };
  then: { action: string };
  priority: number;
  status: string;
}

export function ruleOutcomeFor(
  rules: EngineRuleRow[],
  kind: string,
  target: string,
): { outcome: string; matched: string[]; reason: string } {
  const matching = rules
    .filter((r) => r.status === 'active')
    .filter((r) => r.when.event === 'all' || r.when.event === 'any_action' || r.when.event === kind)
    .filter((r) => {
      // scope:'all' (schema's canonical wildcard) or absent scope matches everything.
      if (!r.when.scope || r.when.scope === 'all') return true;
      return target ? target.startsWith(r.when.scope) : false;
    })
    .sort((a, b) => b.priority - a.priority);

  if (matching.length === 0) {
    if (HIGH_RISK_KINDS.has(kind)) {
      return { outcome: 'require_confirmation', matched: [], reason: `no user rule covers '${kind}'; high-risk default applies` };
    }
    return { outcome: 'allow', matched: [], reason: 'no user rule restricts this action' };
  }

  const strictest = matching.reduce((a, b) => (STRICTNESS[b.then.action] > STRICTNESS[a.then.action] ? b : a));
  const matched = matching.map((r) => r.id);
  if (strictest.then.action === 'deny') {
    return { outcome: 'blocked', matched, reason: `rule ${strictest.id} forbids '${kind}'` };
  }
  return {
    outcome: strictest.then.action === 'allow' ? 'allow' : 'require_confirmation',
    matched,
    reason: `rule ${strictest.id} requires ${strictest.then.action}`,
  };
}

export function registerRuleEngineRoutes(app: FastifyInstance, store: PersonalStore): void {
  app.post<{ Params: { id: string }; Body: { kind: string; target?: string } }>(
    '/api/v1/personal/rules/:id/check',
    async (req, reply) => {
      const { kind, target } = req.body ?? ({} as any);
      if (!kind) { reply.code(400); return { error: 'kind required' }; }
      const rules = store.listRules() as unknown as EngineRuleRow[];
      return ruleOutcomeFor(rules, kind, target ?? '');
    },
  );
}
