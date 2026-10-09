/**
 * P4.4 (TS side) — Octop adapter routes.
 *
 * The Python adapter (engine/personal/adapters/octop.py) is the protocol
 * mapping; these routes expose its surface to the editor frontend through
 * the same loopback-allowed API. Requests carry contract_version,
 * policy_version and trace_id; connection/version/permission failures map
 * to recoverable HTTP states (503 / 409 / 403), never guessed success.
 */
import { FastifyInstance } from 'fastify';

export const OCTOP_PROTOCOL_VERSION = '1.0.2b5';

export interface OctopLikeTransport {
  listSessions(): Promise<Array<{ id: string; name: string }>>;
  readToolReceipt(id: string): Promise<Record<string, unknown>>;
  proposeToolAction(proposal: Record<string, unknown>): Promise<Record<string, unknown>>;
  executeApprovedAction(proposalId: string, token: string): Promise<Record<string, unknown>>;
}

export function registerOctopRoutes(
  app: FastifyInstance,
  transport: OctopLikeTransport,
): void {
  app.get('/api/v1/personal/octop/sessions', async (_req, reply) => {
    try {
      const sessions = await transport.listSessions();
      return { sessions, protocol_version: OCTOP_PROTOCOL_VERSION };
    } catch {
      reply.code(503);
      return { error: 'octop_unreachable', recoverable: true };
    }
  });

  app.get<{ Params: { id: string } }>('/api/v1/personal/octop/receipts/:id', async (req, reply) => {
    try {
      const receipt = await transport.readToolReceipt(req.params.id);
      return { receipt };
    } catch {
      reply.code(503);
      return { error: 'octop_unreachable', recoverable: true };
    }
  });

  app.post('/api/v1/personal/octop/propose', async (req, reply) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const { trace_id, contract_version, policy_version, candidate, confirmation_token } = body;
    if (!trace_id || !candidate || !confirmation_token) {
      reply.code(400);
      return { error: 'trace_id, candidate and confirmation_token required' };
    }
    try {
      const cand = candidate as Record<string, unknown>;
      const proposalId = `prop_${trace_id}_${cand['id']}`;
      const proposal = await transport.proposeToolAction({
        proposal_id: proposalId,
        trace_id,
        contract_version: contract_version ?? 0,
        policy_version: policy_version ?? '',
        ...cand,
        expected_token: confirmation_token,
        status: 'proposed',
      });
      return { proposal };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('forbidden')) { reply.code(403); return { error: msg, recoverable: false }; }
      reply.code(503);
      return { error: msg, recoverable: true };
    }
  });

  app.post('/api/v1/personal/octop/execute', async (req, reply) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const { proposal_id, confirmation_token } = body;
    if (!proposal_id || !confirmation_token) {
      reply.code(400);
      return { error: 'proposal_id and confirmation_token required' };
    }
    try {
      const receipt = await transport.executeApprovedAction(
        String(proposal_id), String(confirmation_token));
      return { receipt };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.toLowerCase().includes('token') || msg.toLowerCase().includes('permission')) {
        reply.code(403);
        return { error: msg, recoverable: true, needs_reconfirmation: true };
      }
      reply.code(503);
      return { error: msg, recoverable: true };
    }
  });
}
