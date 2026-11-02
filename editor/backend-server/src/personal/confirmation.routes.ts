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
import { randomBytes } from 'node:crypto';
import { FastifyInstance } from 'fastify';
import { canonicalHashHex } from './canonical-json';

export interface ConfirmationTicket {
  token: string;
  task_id: string;
  action_id: string;
  parameters_hash: string;
}

function paramHash(params: Record<string, unknown>): string {
  return canonicalHashHex(params);
}

/** JSON 对象才允许作为参数；string/array/null 一律拒绝（400），不猜。 */
function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

export class ConfirmationGate {
  private open = new Map<string, ConfirmationTicket>();

  issue(task_id: string, action_id: string, parameters: Record<string, unknown>): ConfirmationTicket {
    const token = `tok_${randomBytes(16).toString('hex')}`;
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
    if (parameters !== undefined && !isPlainObject(parameters)) {
      reply.code(400);
      return { error: 'parameters must be a JSON object' };
    }
    try {
      const ticket = gate.issue(String(task_id), String(action_id), parameters ?? {});
      return reply.code(201).send(ticket);
    } catch (e) {
      // 参数含无法 canonical 化的值（如非整数浮点）：客户端错误，不是 500。
      if (e instanceof TypeError) {
        reply.code(400);
        return { error: 'parameters contain values that cannot be confirmed' };
      }
      throw e;
    }
  });

  app.post('/api/v1/personal/confirmations/authorize', async (req, reply) => {
    const { token, task_id, action_id, parameters } = (req.body ?? {}) as Record<string, any>;
    if (!token || !task_id || !action_id) {
      reply.code(400);
      return { error: 'token, task_id and action_id required' };
    }
    if (parameters !== undefined && !isPlainObject(parameters)) {
      reply.code(400);
      return { error: 'parameters must be a JSON object' };
    }
    let result: { allowed: boolean; error?: string };
    try {
      result = gate.authorize(String(token), String(task_id), String(action_id), parameters ?? {});
    } catch (e) {
      if (e instanceof TypeError) {
        reply.code(400);
        return { error: 'parameters contain values that cannot be confirmed' };
      }
      throw e;
    }
    if (!result.allowed) {
      reply.code(403);
      return { error: result.error, recoverable: true, needs_reconfirmation: true };
    }
    return { ok: true };
  });
}
