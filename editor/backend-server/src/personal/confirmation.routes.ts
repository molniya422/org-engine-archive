/**
 * P5.2 (TS side) — confirmation tickets + authorize endpoint.
 *
 * Mirror of engine/personal/permission_gate.py token semantics: a token binds
 * (task_id, action_id, parameters_hash), is single-use, and can expire.
 * 点击确认只批准当前动作（含当前参数），不批准未来同类动作。
 *
 * The hard checks (user rules, workspace scope, risk level) stay in the
 * Python RuleEngine/permission gate — this surface only manages the
 * confirmation token lifecycle the frontend interacts with.
 */
import { createHash } from 'node:crypto';
import { FastifyInstance } from 'fastify';

export interface ConfirmationTicket {
  token: string;
  task_id: string;
  action_id: string;
  parameters_hash: string;
}

function paramHash(params: Record<string, unknown>): string {
  return createHash('sha256').update(JSON.stringify(params)).digest('hex');
}

export class ConfirmationGate {
  private open = new Map<string, ConfirmationTicket>();

  issue(task_id: string, action_id: string, parameters: Record<string, unknown>): ConfirmationTicket {
    const token = `tok_${Math.random().toString(16).slice(2)}${Date.now().toString(16)}`;
    const ticket: ConfirmationTicket = {
      token, task_id, action_id, parameters_hash: paramHash(parameters),
    };
    this.open.set(token, ticket);
    return ticket;
  }

  expire(token: string): void {
    this.open.delete(token);
  }

  authorize(
    token: string,
    task_id: string,
    action_id: string,
    parameters: Record<string, unknown>,
  ): { allowed: boolean; error?: string } {
    const ticket = this.open.get(token);
    if (!ticket) {
      return { allowed: false, error: '这条确认已经过期或不存在，请重新确认。' };
    }
    if (ticket.task_id !== task_id || ticket.action_id !== action_id) {
      return { allowed: false, error: '这条确认对应的是另一个操作，请重新确认。' };
    }
    if (ticket.parameters_hash !== paramHash(parameters)) {
      return { allowed: false, error: '操作内容在确认后发生了变化，请重新确认。' };
    }
    // Single use: consume on success.
    this.open.delete(token);
    return { allowed: true };
  }
}

export function registerConfirmationRoutes(app: FastifyInstance, gate: ConfirmationGate): void {
  app.post('/api/v1/personal/confirmations', async (req, reply) => {
    const { task_id, action_id, parameters } = (req.body ?? {}) as Record<string, any>;
    if (!task_id || !action_id) {
      reply.code(400);
      return { error: 'task_id and action_id required' };
    }
    const ticket = gate.issue(String(task_id), String(action_id), parameters ?? {});
    return reply.code(201).send(ticket);
  });

  app.post('/api/v1/personal/confirmations/authorize', async (req, reply) => {
    const { token, task_id, action_id, parameters } = (req.body ?? {}) as Record<string, any>;
    if (!token || !task_id || !action_id) {
      reply.code(400);
      return { error: 'token, task_id and action_id required' };
    }
    const result = gate.authorize(String(token), String(task_id), String(action_id), parameters ?? {});
    if (!result.allowed) {
      reply.code(403);
      return { error: result.error, recoverable: true, needs_reconfirmation: true };
    }
    return { ok: true };
  });
}
