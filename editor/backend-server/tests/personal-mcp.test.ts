/**
 * P9.2 tests — personal MCP safe surface, driven by a REAL MCP client
 * (initialize happens inside client.connect; then tools/list and tool calls
 * go over InMemoryTransport, the same protocol bytes as stdio).
 *
 * 验收：MCP 客户端不能绕过 RuleEngine 或确认 token——发送/删除/付款/提交
 * 根本没有工具；propose_action 无执行路径；所有调用都要 scope。
 */
import { describe, it, expect } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import {
  createPersonalMcpServer,
  personalToolDescriptors,
  PERSONAL_MCP_TOOLS,
  type PersonalMcpExecutor,
  type TracedMcpResult,
} from '../src/mcp/personal-tools';

function fakeExecutor(overrides: Partial<PersonalMcpExecutor> = {}): PersonalMcpExecutor {
  const ok = (result: Record<string, unknown>, trace = 'trace_01', ev: string[] = ['evidence_01']): TracedMcpResult =>
    ({ result, trace_id: trace, evidence_refs: ev });
  return {
    listTasks: async () => ok({ tasks: [{ id: 'task_1', goal: '整理材料' }] }),
    getTask: async (_s, id) => ok({ id, goal: '整理材料' }),
    getEvidence: async (_s, id) => ok({ id, kind: 'file' }),
    simulateTask: async () => ok({ simulated: true, planned_actions: [{ label: '创建整理草稿' }] }),
    proposeAction: async (_s, taskId, action) => ok({ proposal_id: 'prop_mcp_1', task_id: taskId, action }),
    ...overrides,
  };
}

async function connect(exec: PersonalMcpExecutor) {
  const server = createPersonalMcpServer(exec);
  const client = new Client({ name: 'test-client', version: '0.1.0' });
  const [clientTr, serverTr] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTr), client.connect(clientTr)]);
  return { server, client };
}

const SCOPE = { user: 'u1', session: 's1' };

describe('P9.2 personal MCP — real client', () => {
  it('initialize + tools/list exposes exactly the five safe tools', async () => {
    const { client } = await connect(fakeExecutor());
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([...PERSONAL_MCP_TOOLS].sort());
    // 发送/删除/付款/提交没有工具条目——对 MCP 客户端不存在
    const names = tools.map((t) => t.name);
    for (const dangerous of ['send', 'delete', 'pay', 'submit', 'execute_action', 'confirm_action']) {
      expect(names).not.toContain(dangerous);
    }
  });

  it('static descriptors cover exactly the five safe tools', () => {
    expect(personalToolDescriptors().map((d) => d.name).sort())
      .toEqual([...PERSONAL_MCP_TOOLS].sort());
  });

  it('list_tasks with scope returns trace and evidence refs', async () => {
    const { client } = await connect(fakeExecutor());
    const res = await client.callTool({
      name: 'list_tasks',
      arguments: { scope: SCOPE },
    });
    expect(res.isError).toBeFalsy();
    const payload = JSON.parse((res.content as any)[0].text);
    expect(payload.tasks).toHaveLength(1);
    expect(payload.trace_id).toBe('trace_01');
    expect(payload.evidence_refs).toEqual(['evidence_01']);
  });

  it('missing scope is refused on every call', async () => {
    const { client } = await connect(fakeExecutor());
    for (const name of PERSONAL_MCP_TOOLS) {
      const res = await client.callTool({ name, arguments: {} as never });
      expect(res.isError).toBe(true);
      expect((res.content as any)[0].text).toMatch(/scope/);
    }
  });

  it('simulate_task returns planned actions only (sandbox semantics)', async () => {
    const { client } = await connect(fakeExecutor());
    const res = await client.callTool({ name: 'simulate_task', arguments: { scope: SCOPE, goal: '整理材料' } });
    const payload = JSON.parse((res.content as any)[0].text);
    expect(payload.simulated).toBe(true);
    expect(payload.planned_actions[0].label).toBe('创建整理草稿');
  });

  it('propose_action never executes and carries no confirmation-token path', async () => {
    const { client } = await connect(fakeExecutor());
    const res = await client.callTool({
      name: 'propose_action',
      arguments: { scope: SCOPE, task_id: 'task_1', action: { kind: 'draft_file' } },
    });
    const payload = JSON.parse((res.content as any)[0].text);
    expect(payload.will_not_execute).toBe(true);
    expect(payload.requires_user_confirmation).toBe(true);
  });

  it('dangerous tool names are unknown tools', async () => {
    const { client } = await connect(fakeExecutor());
    for (const name of ['delete_file', 'send_email', 'pay_order', 'submit_form']) {
      const res = await client.callTool({ name: name as never, arguments: { scope: SCOPE } as never });
      expect(res.isError).toBe(true);
      expect((res.content as any)[0].text).toMatch(/Unknown tool/);
    }
  });
});
