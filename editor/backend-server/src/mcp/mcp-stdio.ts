import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { createPersonalMcpServer, type PersonalMcpExecutor, type TracedMcpResult } from './personal-tools';

const SERVER_NAME = 'org-engine-editor';
const SERVER_VERSION = '0.1.0';

interface McpOptions {
  daemonUrl: string;
  /** P9.2 — 'org'（默认，开发者编排）或 'personal'（个人助理安全面）。 */
  surface?: 'org' | 'personal';
  /** personal 面的执行器注入（测试用；缺省时走 daemon HTTP）。 */
  personalExecutor?: PersonalMcpExecutor;
}

export async function startMcpStdio(options: McpOptions): Promise<void> {
  const { daemonUrl, surface = 'org' } = options;

  // P9.2 — personal 面：五个安全工具，无执行路径；执行器可注入。
  if (surface === 'personal') {
    const exec = options.personalExecutor ?? createHttpPersonalExecutor(daemonUrl);
    const server = createPersonalMcpServer(exec);
    const transport = new StdioServerTransport();
    await server.connect(transport);
    return;
  }

  const baseUrl = daemonUrl.replace(/\/+$/, '');

  const server = new Server(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: 'list_orgs',
        description: 'List all organizations with department and role counts',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'get_org',
        description: 'Get organization config with departments, roles, and budget',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Organization id/name' },
          },
          required: ['id'],
        },
      },
      {
        name: 'export_org',
        description: 'Export org config as YAML or JSON for deployment',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Organization id/name' },
            format: { type: 'string', enum: ['yaml', 'json'], default: 'yaml' },
          },
          required: ['id'],
        },
      },
      {
        name: 'validate_org',
        description: 'Validate an org config against the JSON schema',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Organization id/name' },
          },
          required: ['id'],
        },
      },
      {
        name: 'list_skills',
        description: 'List scanned agent skills available for roles',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'start_run',
        description: 'Start a multi-agent workflow run against an org config',
        inputSchema: {
          type: 'object',
          properties: {
            org_id: { type: 'string', description: 'Organization id/name' },
            task: { type: 'string', description: 'Task description for the agents' },
          },
          required: ['org_id', 'task'],
        },
      },
      {
        name: 'list_runs',
        description: 'Get current active run status',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'get_run',
        description: 'Get run details including logs and agent events',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Run id' },
          },
          required: ['id'],
        },
      },
      {
        name: 'cancel_run',
        description: 'Cancel an in-progress workflow run',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Run id' },
          },
          required: ['id'],
        },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case 'list_orgs': {
          const res = await fetch(`${baseUrl}/api/v1/orgs`);
          if (!res.ok) throw new Error(`API error: ${res.status}`);
          const data = await res.json();
          return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
        }

        case 'get_org': {
          const id = encodeURIComponent(String(args?.id));
          const res = await fetch(`${baseUrl}/api/v1/orgs/${id}`);
          if (!res.ok) {
            if (res.status === 404) throw new Error(`Org "${args?.id}" not found`);
            throw new Error(`API error: ${res.status}`);
          }
          const data = await res.json();
          return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
        }

        case 'export_org': {
          const id = encodeURIComponent(String(args?.id));
          const format = String(args?.format || 'yaml');
          const res = await fetch(`${baseUrl}/api/v1/orgs/${id}/export?format=${format}`);
          if (!res.ok) {
            if (res.status === 404) throw new Error(`Org "${args?.id}" not found`);
            throw new Error(`API error: ${res.status}`);
          }
          const text = await res.text();
          return { content: [{ type: 'text', text }] };
        }

        case 'validate_org': {
          const id = encodeURIComponent(String(args?.id));
          // First get the org data, then validate
          const getRes = await fetch(`${baseUrl}/api/v1/orgs/${id}`);
          if (!getRes.ok) throw new Error(`Org "${args?.id}" not found`);
          const orgData = await getRes.json();
          const valRes = await fetch(`${baseUrl}/api/v1/orgs/${id}/validate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(orgData),
          });
          const result = await valRes.json();
          return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }

        case 'list_skills': {
          const res = await fetch(`${baseUrl}/api/v1/skills`);
          if (!res.ok) throw new Error(`API error: ${res.status}`);
          const data = await res.json();
          return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
        }

        case 'start_run': {
          const res = await fetch(`${baseUrl}/api/v1/runs`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              org_id: args?.org_id,
              task: args?.task,
            }),
          });
          if (!res.ok) {
            const err = await res.json().catch(() => ({ error: res.statusText }));
            throw new Error(String(err.error || 'Failed to start run'));
          }
          const data = await res.json();
          return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
        }

        case 'list_runs': {
          const res = await fetch(`${baseUrl}/api/v1/runs`);
          if (!res.ok) throw new Error(`API error: ${res.status}`);
          const data = await res.json();
          return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
        }

        case 'get_run': {
          const id = encodeURIComponent(String(args?.id));
          const res = await fetch(`${baseUrl}/api/v1/runs/${id}`);
          if (!res.ok) {
            if (res.status === 404) throw new Error(`Run "${args?.id}" not found`);
            throw new Error(`API error: ${res.status}`);
          }
          const data = await res.json();
          return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
        }

        case 'cancel_run': {
          const id = encodeURIComponent(String(args?.id));
          const res = await fetch(`${baseUrl}/api/v1/runs/${id}/cancel`, { method: 'POST' });
          if (!res.ok) throw new Error(`API error: ${res.status}`);
          const data = await res.json();
          return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
        }

        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (err: any) {
      return {
        content: [{ type: 'text', text: `Error: ${err.message}` }],
        isError: true,
      };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

/** 默认的 personal 执行器：把五个安全调用转发给后端 HTTP API。 */
export function createHttpPersonalExecutor(baseUrl: string): PersonalMcpExecutor {
  const root = baseUrl.replace(/\/+$/, '');
  const call = async (path: string, init?: RequestInit): Promise<any> => {
    const res = await fetch(`${root}${path}`, init);
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    return res.json();
  };
  const wrap = (r: any): TracedMcpResult => ({
    result: r?.result ?? r ?? {},
    trace_id: r?.trace_id ?? null,
    evidence_refs: r?.evidence_refs ?? [],
  });
  return {
    listTasks: async () => wrap(await call('/api/v1/personal/tasks')),
    getTask: async (_s, taskId) => wrap(await call(`/api/v1/personal/tasks/${encodeURIComponent(taskId)}`)),
    getEvidence: async (_s, evidenceId) => wrap(await call(`/api/v1/personal/evidence/${encodeURIComponent(evidenceId)}`)),
    simulateTask: async (_s, goal) => wrap(await call('/api/v1/personal/simulate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ goal }),
    })),
    proposeAction: async (_s, taskId, action) => wrap(await call(`/api/v1/personal/tasks/${encodeURIComponent(taskId)}/proposals`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(action),
    })),
  };
}

// Only auto-start when run directly
const isEntryPoint = process.argv[1] && (
  process.argv[1].endsWith('mcp-stdio.ts') || process.argv[1].endsWith('mcp-stdio.js')
);
if (isEntryPoint) {
  const args = process.argv.slice(2);
  const daemonUrlIndex = args.indexOf('--daemon-url');
  const daemonUrl = daemonUrlIndex !== -1 && daemonUrlIndex + 1 < args.length
    ? args[daemonUrlIndex + 1]
    : 'http://localhost:5172';
  const surfaceIndex = args.indexOf('--surface');
  const surface = surfaceIndex !== -1 && surfaceIndex + 1 < args.length
    ? (args[surfaceIndex + 1] as 'org' | 'personal')
    : 'org';
  startMcpStdio({ daemonUrl, surface }).catch((err) => {
    console.error('MCP server failed:', err);
    process.exit(1);
  });
}
