# MCP Integration Design for Org Engine Editor

> **Status:** Design Document v1
> **Goal:** Enable Claude Code to interact with the Org Engine Editor via MCP (Model Context Protocol) — list orgs, read configs, validate, run workflows, and export deployments.

## Architecture

```
Claude Code (MCP Client)
       │
       │ stdin/stdout (stdio transport)
       ▼
org-engine-editor mcp  (MCP stdio server, @modelcontextprotocol/sdk)
       │
       │ HTTP REST (localhost:5172)
       ▼
Fastify Backend  (existing routes + new /api/v1/mcp/*)
```

The MCP server is **stateless** — every tool call translates to a `fetch()` against the running Fastify backend. The server holds no file state; the backend is the single source of truth.

## MCP Tools

| Tool | HTTP Mapping | Description |
|------|-------------|-------------|
| `list_orgs` | `GET /api/v1/orgs` | List all organizations with metadata |
| `get_org` | `GET /api/v1/orgs/:id` | Get org config with departments/roles |
| `export_org` | `GET /api/v1/orgs/:id/export?format=` | Export org config (yaml/json) |
| `validate_org` | `POST /api/v1/orgs/:id/validate` | Validate org config against schema |
| `list_skills` | `GET /api/v1/skills` | List scanned skills |
| `start_run` | `POST /api/v1/runs` | Start a multi-agent run |
| `list_runs` | `GET /api/v1/runs` | Get current/active run status |
| `get_run` | `GET /api/v1/runs/:id` | Get run details and logs |
| `cancel_run` | `POST /api/v1/runs/:id/cancel` | Cancel a running workflow |

## Files to Create/Modify

### New Files

1. **`backend-server/src/mcp/mcp-stdio.ts`** — MCP stdio server using `@modelcontextprotocol/sdk`
2. **`backend-server/src/mcp/index.ts`** — barrel export
3. **`plugins/org-engine-editor/.mcp.json`** — MCP server config for Claude Code
4. **`.claude-plugin/marketplace.json`** — Plugin marketplace entry
5. **`apps/cli.mjs`** — CLI entrypoint for `org-engine-editor mcp` command

### Modified Files

6. **`backend-server/src/server.ts`** — Add MCP routes export
7. **`frontend/src/api/client.ts`** — Ensure base URL works with MCP proxy context
8. **`package.json`** — Add `bin`, `@modelcontextprotocol/sdk` dependency, `build:mcp` script
9. **`frontend/src/views/HomeView.tsx`** — Improved layout referencing Open Design EntryView
10. **`frontend/src/layouts/AppShell.tsx`** — Toolbar improvements

## File Details

### 1. MCP Stdio Server (`backend-server/src/mcp/mcp-stdio.ts`)

Uses the `@modelcontextprotocol/sdk` to implement a stdio transport server.

```typescript
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

// Each tool handler calls fetch() against the backend URL
// Server registers tools, listens on stdin, writes to stdout
```

### 2. Plugin Registration

**`.mcp.json`** — Minimal config that Claude Code reads on `claude mcp add`:
```json
{
  "mcpServers": {
    "org-engine-editor": {
      "type": "stdio",
      "command": "org-engine-editor",
      "args": ["mcp", "--daemon-url", "http://127.0.0.1:5172"]
    }
  }
}
```

**`marketplace.json`** — Plugin marketplace discoverability:
```json
{
  "name": "org-engine-editor",
  "plugins": [{
    "name": "org-engine-editor",
    "source": "./plugins/org-engine-editor"
  }]
}
```

### 3. CLI Entrypoint

`apps/cli.mjs` serves as the `org-engine-editor` binary:
```javascript
#!/usr/bin/env node
// Parse argv, dispatch to mcp subcommand
// "org-engine-editor mcp --daemon-url <url>" starts the stdio server
```

### 4. Home Page Layout Improvements

Reference Open Design's EntryView pattern:
- Card grid with empty states
- Active run banner with real-time status
- Quick-action buttons (New Org, Import, Export)
- Settings gear icon in toolbar

## Implementation Order

1. Install `@modelcontextprotocol/sdk` dependency
2. Create `backend-server/src/mcp/mcp-stdio.ts` with tool handlers
3. Add CLI entrypoint `apps/cli.mjs`
4. Add plugin registration files
5. Create MCP install-info route
6. Update `package.json` with scripts and bin
7. Improve home page layout
8. Test: `claude mcp add org-engine-editor` → verify tool calls
9. Update E2E tests
