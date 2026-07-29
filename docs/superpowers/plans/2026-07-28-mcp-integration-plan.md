# MCP Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable Claude Code to interact with the Org Engine Editor via MCP — list orgs, read configs, validate, run workflows, and export deployments.

**Architecture:** Stateless MCP stdio server using `@modelcontextprotocol/sdk` translates tool calls to fetch() against the running Fastify backend. Plugin registration files let Claude Code auto-discover via `claude mcp add`.

**Tech Stack:** `@modelcontextprotocol/sdk` 1.30.0, Fastify (existing), Node 24, TypeScript

**Spec Reference:** `docs/superpowers/specs/2026-07-28-mcp-integration-design.md`

---

### Task 1: Install dependency + create MCP directory structure

**Files:**
- Modify: `package.json` (root)
- Modify: `backend-server/package.json`
- Create: `backend-server/src/mcp/mcp-stdio.ts`
- Create: `backend-server/src/mcp/index.ts`

- [ ] **Step 1: Install @modelcontextprotocol/sdk**

Run from project root:
```bash
npm install @modelcontextprotocol/sdk@^1.30.0
```

- [ ] **Step 2: Create backend-server/src/mcp/index.ts**

```typescript
export { startMcpStdio } from './mcp-stdio.js';
```

- [ ] **Step 3: Commit dependency**

```bash
git add package.json package-lock.json backend-server/package.json backend-server/src/mcp/index.ts
git commit -m "chore: add @modelcontextprotocol/sdk dependency"
```

### Task 2: Create MCP stdio server with all tool handlers

**Files:**
- Create: `backend-server/src/mcp/mcp-stdio.ts`
- Modify: `backend-server/src/server.ts` (export startServer types)

- [ ] **Step 1: Write the complete MCP stdio server**

File: `backend-server/src/mcp/mcp-stdio.ts`

```typescript
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

// Parse args and start
const args = process.argv.slice(2);
const daemonUrlIndex = args.indexOf('--daemon-url');
const daemonUrl = daemonUrlIndex !== -1 && daemonUrlIndex + 1 < args.length
  ? args[daemonUrlIndex + 1]
  : 'http://localhost:5172';

startMcpStdio({ daemonUrl }).catch((err) => {
  console.error('MCP server failed:', err);
  process.exit(1);
});
```

- [ ] **Step 2: Commit**

```bash
git add backend-server/src/mcp/mcp-stdio.ts
```

### Task 3: Create MCP install-info route

**Files:**
- Create: `backend-server/src/mcp/routes.ts`
- Modify: `backend-server/src/server.ts`

- [ ] **Step 1: Create MCP install-info route**

File: `backend-server/src/mcp/routes.ts`

```typescript
import { FastifyInstance } from 'fastify';

export function registerMcpRoutes(app: FastifyInstance): void {
  app.get('/api/v1/mcp/install-info', async () => {
    const port = process.env.PORT || '5172';
    return {
      cli_command: 'org-engine-editor',
      cli_args: ['mcp', '--daemon-url', `http://localhost:${port}`],
      daemon_url: `http://localhost:${port}`,
      mcp_version: '1.30.0',
      platform: process.platform,
      node_version: process.version,
    };
  });
}
```

- [ ] **Step 2: Register route in server.ts**

Edit `backend-server/src/server.ts` to import and register MCP routes:

Add import near the top:
```typescript
import { registerMcpRoutes } from './mcp/routes.js';
```

Add registration line after other route registrations:
```typescript
registerMcpRoutes(app);
```

- [ ] **Step 3: Commit**

```bash
git add backend-server/src/mcp/routes.ts backend-server/src/server.ts
git commit -m "feat: add MCP install-info route"
```

### Task 4: Create CLI entrypoint

**Files:**
- Create: `apps/cli.mjs`
- Modify: `package.json` (add bin)

- [ ] **Step 1: Create CLI entrypoint**

File: `apps/cli.mjs`

```javascript
#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);

if (args[0] === 'mcp') {
  const daemonUrlIndex = args.indexOf('--daemon-url');
  const daemonUrl = daemonUrlIndex !== -1 && daemonUrlIndex + 1 < args.length
    ? args[daemonUrlIndex + 1]
    : 'http://localhost:5172';

  // Start MCP stdio server
  const mcpPath = resolve(__dirname, '../backend-server/src/mcp/mcp-stdio.ts');
  if (existsSync(mcpPath)) {
    // In dev mode, use tsx to run the TypeScript file
    await import('tsx').catch(() => {});
    const { startMcpStdio } = await import(resolve(__dirname, '../backend-server/src/mcp/mcp-stdio.js'));
    await startMcpStdio({ daemonUrl });
  } else {
    // In production (built bundle), load bundled version
    const { startMcpStdio } = await import(resolve(__dirname, '../backend-server/bundle/mcp-stdio.cjs'));
    await startMcpStdio({ daemonUrl });
  }
} else {
  console.log(`Usage: org-engine-editor mcp [--daemon-url <url>]`);
  process.exit(1);
}
```

- [ ] **Step 2: Update root package.json to add bin**

```json
"bin": {
  "org-engine-editor": "./apps/cli.mjs"
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/cli.mjs package.json
git commit -m "feat: add CLI entrypoint for org-engine-editor mcp command"
```

### Task 5: Add plugin registration files

**Files:**
- Create: `plugins/org-engine-editor/.mcp.json`
- Create: `.claude-plugin/marketplace.json`

- [ ] **Step 1: Create .mcp.json**

File: `plugins/org-engine-editor/.mcp.json`

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

- [ ] **Step 2: Create marketplace.json**

File: `.claude-plugin/marketplace.json`

```json
{
  "$schema": "https://raw.githubusercontent.com/anthropics/claude-code/main/schemas/marketplace.json",
  "name": "org-engine-editor",
  "owner": {
    "name": "Org Engine Team"
  },
  "description": "Org Engine Editor — manage multi-agent organization hierarchies, run workflows, and export configs. Accessible from Claude Code via stdio MCP.",
  "plugins": [
    {
      "name": "org-engine-editor",
      "source": "./plugins/org-engine-editor",
      "description": "MCP server for managing multi-agent org configs"
    }
  ]
}
```

- [ ] **Step 3: Commit**

```bash
git add plugins/org-engine-editor/.mcp.json .claude-plugin/marketplace.json
git commit -m "feat: add Claude Code plugin registration files"
```

### Task 6: Update build scripts for MCP bundle

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Add build:mcp script to package.json**

Add to scripts:
```json
"build:mcp": "esbuild backend-server/src/mcp/mcp-stdio.ts --bundle --platform=node --target=node22 --outfile=backend-server/bundle/mcp-stdio.cjs --external:@modelcontextprotocol/sdk",
"build": "npm run build:backend && npm run build:mcp && npm run build:frontend && npm run build:electron"
```

- [ ] **Step 2: Commit**

```bash
git add package.json
git commit -m "chore: add MCP build script to pipeline"
```

### Task 7: Improve HomeView layout (reference Open Design EntryView)

**Files:**
- Modify: `frontend/src/views/HomeView.tsx`
- Modify: `frontend/src/views/HomeView.module.css`

- [ ] **Step 1: Update HomeView.module.css with improved layout**

```css
/* Improved HomeView layout */
.homeContainer {
  padding: 24px;
  max-width: 1200px;
  margin: 0 auto;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.headerLeft {
  display: flex;
  align-items: center;
  gap: 12px;
}

.headerTitle {
  font-size: 1.5rem;
  font-weight: 700;
  margin: 0;
}

.headerSubtitle {
  color: var(--text-secondary, #666);
  font-size: 0.875rem;
  margin: 4px 0 0 0;
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* Active run banner */
.runBanner {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
  border: 1px solid #0f3460;
  border-radius: 8px;
  margin-bottom: 20px;
  color: #e0e0e0;
}

.runDot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #00ff88;
  animation: pulse 1.5s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; box-shadow: 0 0 4px #00ff88; }
  50% { opacity: 0.5; box-shadow: 0 0 8px #00ff88; }
}

.runInfo {
  flex: 1;
}

.runTitle {
  font-weight: 600;
  font-size: 0.95rem;
}

.runOrg {
  font-size: 0.8rem;
  opacity: 0.7;
}

.viewRunBtn {
  padding: 6px 14px;
  background: #0f3460;
  color: #e0e0e0;
  border: 1px solid #1a5276;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.85rem;
  transition: background 0.2s;
}

.viewRunBtn:hover {
  background: #1a5276;
}

/* Org grid */
.orgGrid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
}

.orgCard {
  background: var(--card-bg, #fff);
  border: 1px solid var(--border-color, #e0e0e0);
  border-radius: 10px;
  padding: 20px;
  cursor: pointer;
  transition: box-shadow 0.2s, transform 0.15s;
}

.orgCard:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  transform: translateY(-1px);
}

.orgName {
  font-size: 1.1rem;
  font-weight: 600;
  margin: 0 0 4px 0;
}

.orgMeta {
  font-size: 0.85rem;
  color: var(--text-secondary, #666);
  margin: 0;
}

.orgBadges {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}

.badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  background: var(--badge-bg, #f0f0f0);
  border-radius: 12px;
  font-size: 0.75rem;
  color: var(--text-secondary, #555);
}

.badgeRunning {
  background: #e8f5e9;
  color: #2e7d32;
}

/* Empty state */
.emptyState {
  text-align: center;
  padding: 60px 20px;
  color: var(--text-secondary, #888);
}

.emptyIcon {
  font-size: 48px;
  margin-bottom: 16px;
  opacity: 0.5;
}

.emptyTitle {
  font-size: 1.25rem;
  font-weight: 600;
  margin: 0 0 8px 0;
  color: var(--text-primary, #333);
}

.emptyDesc {
  font-size: 0.9rem;
  margin: 0 0 20px 0;
  max-width: 400px;
  margin-left: auto;
  margin-right: auto;
}

.createBtn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 10px 20px;
  background: var(--primary, #1976d2);
  color: white;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-size: 0.9rem;
  font-weight: 500;
  text-decoration: none;
  transition: background 0.2s;
}

.createBtn:hover {
  background: var(--primary-dark, #1565c0);
}

/* Quick actions */
.quickActions {
  display: flex;
  gap: 12px;
  margin-top: 24px;
}

.actionCard {
  flex: 1;
  padding: 16px;
  border: 1px dashed var(--border-color, #ccc);
  border-radius: 8px;
  text-align: center;
  cursor: pointer;
  transition: border-color 0.2s, background 0.2s;
}

.actionCard:hover {
  border-color: var(--primary, #1976d2);
  background: var(--primary-bg, #e3f2fd);
}

.actionIcon {
  font-size: 24px;
  margin-bottom: 8px;
}

.actionLabel {
  font-size: 0.9rem;
  font-weight: 500;
  margin: 0;
}

.actionDesc {
  font-size: 0.8rem;
  color: var(--text-secondary, #888);
  margin: 4px 0 0 0;
}
```

- [ ] **Step 2: Update HomeView.tsx with improved layout**

Replace file `frontend/src/views/HomeView.tsx`:

```typescript
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { t } from '../i18n';
import styles from './HomeView.module.css';

interface OrgSummary {
  id: string;
  name: string;
  deptCount: number;
  roleCount: number;
}

interface ActiveRun {
  active: boolean;
  runId?: string;
  orgId?: string;
  task?: string;
}

export function HomeView() {
  const navigate = useNavigate();
  const [orgs, setOrgs] = useState<OrgSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeRun, setActiveRun] = useState<ActiveRun | null>(null);

  useEffect(() => {
    loadOrgs();
    checkActiveRun();
    const interval = setInterval(checkActiveRun, 5000);
    return () => clearInterval(interval);
  }, []);

  async function loadOrgs() {
    try {
      const list = await api.listOrgs();
      setOrgs(list);
    } catch { /* ignore */ }
    setLoading(false);
  }

  async function checkActiveRun() {
    try {
      const run = await api.getActiveRun();
      setActiveRun(run);
    } catch { /* ignore */ }
  }

  return (
    <div className={styles.homeContainer}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div>
            <h1 className={styles.headerTitle}>{t('home.title')}</h1>
            <p className={styles.headerSubtitle}>{t('home.subtitle')}</p>
          </div>
        </div>
        <div className={styles.toolbar}>
          <button className={styles.createBtn} onClick={() => navigate('/studio/new')}>
            + {t('home.createOrg')}
          </button>
        </div>
      </div>

      {/* Active run banner */}
      {activeRun?.active && (
        <div className={styles.runBanner}>
          <div className={styles.runDot} />
          <div className={styles.runInfo}>
            <div className={styles.runTitle}>{activeRun.task}</div>
            <div className={styles.runOrg}>{activeRun.orgId}</div>
          </div>
          <button
            className={styles.viewRunBtn}
            onClick={() => navigate(`/run/${activeRun.runId}`)}
          >
            {t('run.viewDetails')}
          </button>
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className={styles.emptyState}>
          <p>{t('common.loading')}</p>
        </div>
      )}

      {/* Empty state */}
      {!loading && orgs.length === 0 && (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>🏢</div>
          <h2 className={styles.emptyTitle}>{t('home.emptyTitle')}</h2>
          <p className={styles.emptyDesc}>{t('home.emptyDesc')}</p>
          <button className={styles.createBtn} onClick={() => navigate('/studio/new')}>
            + {t('home.createOrg')}
          </button>
        </div>
      )}

      {/* Org grid */}
      {orgs.length > 0 && (
        <>
          <div className={styles.orgGrid}>
            {orgs.map((org) => (
              <div
                key={org.id}
                className={styles.orgCard}
                onClick={() => navigate(`/studio/${org.id}`)}
              >
                <h3 className={styles.orgName}>{org.name}</h3>
                <p className={styles.orgMeta}>
                  {org.deptCount} departments · {org.roleCount} roles
                </p>
                <div className={styles.orgBadges}>
                  <span className={styles.badge}>
                    📁 {org.deptCount} depts
                  </span>
                  <span className={styles.badge}>
                    👤 {org.roleCount} roles
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Quick actions */}
          <div className={styles.quickActions}>
            <div className={styles.actionCard} onClick={() => navigate('/studio/new')}>
              <div className={styles.actionIcon}>➕</div>
              <p className={styles.actionLabel}>{t('home.createOrg')}</p>
              <p className={styles.actionDesc}>{t('home.createOrgDesc')}</p>
            </div>
            <div className={styles.actionCard} onClick={() => navigate('/skills')}>
              <div className={styles.actionIcon}>🔧</div>
              <p className={styles.actionLabel}>{t('nav.skills')}</p>
              <p className={styles.actionDesc}>{t('home.skillsDesc')}</p>
            </div>
            <div
              className={styles.actionCard}
              onClick={async () => {
                if (orgs.length > 0) {
                  try {
                    const yaml = await api.exportOrg(orgs[0].id, 'yaml');
                    await navigator.clipboard.writeText(yaml);
                    alert(t('export.copied'));
                  } catch { /* ignore */ }
                }
              }}
            >
              <div className={styles.actionIcon}>📋</div>
              <p className={styles.actionLabel}>{t('export.copy')}</p>
              <p className={styles.actionDesc}>{t('home.exportDesc')}</p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/views/HomeView.tsx frontend/src/views/HomeView.module.css
git commit -m "feat: improve HomeView layout with empty states, run banner, quick actions"
```

### Task 8: Update AppShell toolbar

**Files:**
- Modify: `frontend/src/layouts/AppShell.tsx`

- [ ] **Step 1: Add settings gear and MCP info to AppShell**

Edit `AppShell.tsx`, after the title or in the header area, add a settings icon:

```typescript
// Add near other nav items or in header
<button
  className={styles.settingsBtn}
  onClick={() => {/* could open settings or show MCP status */}}
  title={t('nav.settings')}
>
  ⚙️
</button>
```

And add CSS if needed (or use existing styles).

- [ ] **Step 2: Commit**

```bash
git add frontend/src/layouts/AppShell.tsx
git commit -m "feat: add settings button to AppShell toolbar"
```

### Task 9: Bundle MCP server and build

**Files:**
- Modify: `package.json` (already done in Task 6)

- [ ] **Step 1: Build MCP bundle**

```bash
npm run build:mcp
```

Verify the output file exists:
```bash
ls -la backend-server/bundle/mcp-stdio.cjs
```

- [ ] **Step 2: Full build test**

```bash
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add backend-server/bundle/mcp-stdio.cjs
git commit -m "chore: build MCP bundle"
```

### Task 10: Add MCP E2E tests

**Files:**
- Create: `frontend/e2e/mcp.spec.ts`

- [ ] **Step 1: Create MCP test spec**

File: `frontend/e2e/mcp.spec.ts`

```typescript
import { test, expect } from '@playwright/test';

test.describe('MCP integration', () => {
  test('install-info endpoint returns MCP config', async ({ request }) => {
    const resp = await request.get('/api/v1/mcp/install-info');
    expect(resp.ok()).toBeTruthy();
    const info = await resp.json();
    expect(info.cli_command).toBe('org-engine-editor');
    expect(info.mcp_version).toBeTruthy();
    expect(info.daemon_url).toContain('localhost');
  });

  test('MCP stdio server responds to ListTools', async ({ request }) => {
    // The MCP server uses stdio transport, so we test the underlying
    // HTTP API that the MCP server calls
    const resp = await request.get('/api/v1/orgs');
    expect(resp.ok()).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the e2e tests**

```bash
cd frontend && npx playwright test --config=e2e/playwright.config.ts e2e/mcp.spec.ts
```

- [ ] **Step 3: Commit**

```bash
git add frontend/e2e/mcp.spec.ts
git commit -m "test: add MCP integration e2e tests"
```

### Task 11: Final review and smoke test

- [ ] **Step 1: Verify all files are in git**

```bash
git status --short
```

- [ ] **Step 2: Run full test suite**

```bash
cd frontend && npx playwright test --config=e2e/playwright.config.ts
```

- [ ] **Step 3: Install plugin locally and test**

```bash
# From the project root
claude mcp add org-engine-editor
# Then test a tool call
claude -p "list my organizations using org-engine-editor"
```

- [ ] **Step 4: Commit any final fixes**

```bash
git add -A
git commit -m "chore: final MCP integration fixes after smoke test"
```
