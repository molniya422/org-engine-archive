import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

const SERVER_NAME = 'org-engine-editor';
const SERVER_VERSION = '0.1.0';

interface McpOptions {
  daemonUrl: string;
}

export async function startMcpStdio(options: McpOptions): Promise<void> {
  const { daemonUrl } = options;
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
  startMcpStdio({ daemonUrl }).catch((err) => {
    console.error('MCP server failed:', err);
    process.exit(1);
  });
}
