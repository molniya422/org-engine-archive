/**
 * P9.2 — personal MCP 安全面。
 *
 * 只暴露五个只读/只提案工具：list_tasks、get_task、get_evidence、
 * simulate_task、propose_action。发送、删除、付款、提交**没有工具条目**——
 * 不是"拒绝调用"，而是对 MCP 客户端根本不存在。
 *
 * MCP 客户端不能绕过 RuleEngine 或确认 token，因为：
 * 1. simulate_task 只返回计划（沙盒语义），没有执行路径；
 * 2. propose_action 只记录提案，回复里 `will_not_execute: true`，且工具
 *    入参中没有确认 token 的位置——token 只属于 HTTP 确认链路（P5.5）。
 *
 * 所有调用必须携带 user/session scope；每次响应都带 trace_id 和
 * evidence_refs，保证可追溯。
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

export const PERSONAL_MCP_TOOLS = [
  'list_tasks',
  'get_task',
  'get_evidence',
  'simulate_task',
  'propose_action',
] as const;

export type PersonalMcpTool = (typeof PERSONAL_MCP_TOOLS)[number];

/** 永不出现在工具列表里的危险类别（写入文档与测试双保险）。 */
export const FORBIDDEN_ACTIONS = ['send', 'delete', 'pay', 'submit'] as const;

export interface McpScope {
  user: string;
  session: string;
}

export interface ScopeGuard {
  /** 每次调用都要通过：user + session 缺一不可。 */
  assertScope(scope: unknown): McpScope;
}

export class ScopeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ScopeError';
  }
}

export const scopeGuard: ScopeGuard = {
  assertScope(scope: unknown): McpScope {
    const s = scope as McpScope | undefined;
    if (!s || typeof s.user !== 'string' || !s.user || typeof s.session !== 'string' || !s.session) {
      throw new ScopeError('缺少 user/session scope，调用被拒绝');
    }
    return { user: s.user, session: s.session };
  },
};

/** 模拟/提案返回的可追溯信封：MCP 响应强制携带 trace + evidence refs。 */
export interface TracedMcpResult {
  result: Record<string, unknown>;
  trace_id: string | null;
  evidence_refs: string[];
}

export interface PersonalMcpExecutor {
  listTasks(scope: McpScope): Promise<TracedMcpResult>;
  getTask(scope: McpScope, taskId: string): Promise<TracedMcpResult>;
  getEvidence(scope: McpScope, evidenceId: string): Promise<TracedMcpResult>;
  /** 沙盒模拟：只返回计划，永不执行。 */
  simulateTask(scope: McpScope, goal: string): Promise<TracedMcpResult>;
  /** 只记录提案；确认 token 不经过 MCP——回复保证 will_not_execute。 */
  proposeAction(scope: McpScope, taskId: string, action: Record<string, unknown>): Promise<TracedMcpResult>;
}

/** 提案结果的固定语义：MPC 客户端拿到的永远是「未执行」。 */
export function asProposal(r: TracedMcpResult): TracedMcpResult {
  return {
    result: {
      ...r.result,
      will_not_execute: true,
      requires_user_confirmation: true,
      note: 'MCP 无法执行动作，也无法提交确认 token——确认只能在应用内完成。',
    },
    trace_id: r.trace_id,
    evidence_refs: r.evidence_refs,
  };
}

function textPayload(r: TracedMcpResult): string {
  return JSON.stringify({
    ...r.result,
    trace_id: r.trace_id,
    evidence_refs: r.evidence_refs,
  }, null, 2);
}

/** 五个工具的静态描述（dangerous 类目不在此列）。 */
export function personalToolDescriptors() {
  return [
    {
      name: 'list_tasks',
      description: 'List personal tasks (read-only). Requires scope {user, session}.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          scope: { type: 'object', properties: { user: { type: 'string' }, session: { type: 'string' } }, required: ['user', 'session'] },
        },
        required: ['scope'],
      },
    },
    {
      name: 'get_task',
      description: 'Get one personal task with its trace refs (read-only).',
      inputSchema: {
        type: 'object' as const,
        properties: {
          scope: { type: 'object', properties: { user: { type: 'string' }, session: { type: 'string' } }, required: ['user', 'session'] },
          task_id: { type: 'string' },
        },
        required: ['scope', 'task_id'],
      },
    },
    {
      name: 'get_evidence',
      description: 'Get one evidence record (read-only).',
      inputSchema: {
        type: 'object' as const,
        properties: {
          scope: { type: 'object', properties: { user: { type: 'string' }, session: { type: 'string' } }, required: ['user', 'session'] },
          evidence_id: { type: 'string' },
        },
        required: ['scope', 'evidence_id'],
      },
    },
    {
      name: 'simulate_task',
      description: 'Sandbox simulation only — returns planned actions, never executes anything.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          scope: { type: 'object', properties: { user: { type: 'string' }, session: { type: 'string' } }, required: ['user', 'session'] },
          goal: { type: 'string' },
        },
        required: ['scope', 'goal'],
      },
    },
    {
      name: 'propose_action',
      description: 'Record an action proposal only. No execution path exists via MCP; confirmation token lives in the app, not here.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          scope: { type: 'object', properties: { user: { type: 'string' }, session: { type: 'string' } }, required: ['user', 'session'] },
          task_id: { type: 'string' },
          action: { type: 'object' },
        },
        required: ['scope', 'task_id', 'action'],
      },
    },
  ];
}

/** Build a personal-surface MCP server (transport is connected by the caller). */
export function createPersonalMcpServer(exec: PersonalMcpExecutor, guard: ScopeGuard = scopeGuard): Server {
  const server = new Server(
    { name: 'org-engine-personal', version: '0.1.0' },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: personalToolDescriptors(),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
      if (!PERSONAL_MCP_TOOLS.includes(name as PersonalMcpTool)) {
        // 危险动作在这里表现为「未知工具」，不是「被拒绝」——从未存在过。
        throw new ScopeError(`Unknown tool: ${name}`);
      }
      const scope = guard.assertScope(args?.scope);
      let result: TracedMcpResult;
      switch (name) {
        case 'list_tasks':
          result = await exec.listTasks(scope);
          break;
        case 'get_task':
          result = await exec.getTask(scope, String(args?.task_id));
          break;
        case 'get_evidence':
          result = await exec.getEvidence(scope, String(args?.evidence_id));
          break;
        case 'simulate_task':
          result = await exec.simulateTask(scope, String(args?.goal));
          break;
        case 'propose_action':
          result = asProposal(
            await exec.proposeAction(scope, String(args?.task_id), (args?.action as Record<string, unknown>) ?? {}),
          );
          break;
        default:
          throw new ScopeError(`Unknown tool: ${name}`);
      }
      return { content: [{ type: 'text', text: textPayload(result) }] };
    } catch (err: any) {
      return {
        content: [{ type: 'text', text: `Error: ${err?.message ?? String(err)}` }],
        isError: true,
      };
    }
  });

  return server;
}
