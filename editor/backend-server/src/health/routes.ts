import type { FastifyInstance } from 'fastify';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { listPlaybooks } from '../playbooks/engine';

// In esbuild bundle output (CJS), __dirname is automatically provided
// In tsx/dev mode (ESM), we resolve via process.cwd() which is adequate for health checks
let currentDir: string;
try { currentDir = (typeof __dirname !== 'undefined' ? __dirname : process.cwd()); }
catch { currentDir = process.cwd(); }

// Robust packaged-mode detection: check for asar archive, resourcesPath, or
// process.execPath containing org-engine-process-app.exe at the proper depth
const APP_NAME = 'org-engine-editor';
const __isPackaged =
  currentDir.includes('.asar') ||
  !!((process as any).resourcesPath) ||
  ((process.execPath ?? '').toLowerCase().includes(`${APP_NAME}.exe`));

// ─── Schema check ───────────────────────────────────────────────────────────

interface SchemaCheck {
  path: string;
  exists: boolean;
}

function buildSchemaCandidates(): string[] {
  const cwd = process.cwd();
  const rp = (process as any).resourcesPath as string | undefined;

  const result: string[] = [
    // dev mode: relative to cwd (project root)
    join(cwd, 'schema', 'org-config.schema.json'),
    join(cwd, '..', 'schema', 'org-config.schema.json'),
    // double check from __dirname when running as tsx/esbuild
    join(currentDir, '../../../schema/org-config.schema.json'),
    join(currentDir, '../../schema/org-config.schema.json'),
  ];

  if (rp) {
    // Primary packaged path: resources/schema/
    result.push(join(rp, 'schema', 'org-config.schema.json'));
    // Backup: one level up from resources (extraResources are placed adjacent)
    result.push(join(rp, '..', 'schema', 'org-config.schema.json'));
    // Also try app/schema (sometimes asar-unpacked resources land inside the app.asar directory)
    result.push(join(rp, '..', 'app', 'schema', 'org-config.schema.json'));
  }

  return result;
}

function checkSchema(): { available: boolean; paths: SchemaCheck[]; found: string | null } {
  const candidates = buildSchemaCandidates();
  const paths = candidates.map((p) => ({ path: p, exists: existsSync(p) }));
  const found = paths.find((p) => p.exists)?.path ?? null;
  return { available: found !== null, paths, found };
}

// ── Harness check ───────────────────────────────────────────────────────────

const HARNESS_NAMES = ['orchestrator-adapter.exe', 'orchestrator-adapter'];

interface HarnessCheck {
  path: string;
  exists: boolean;
}

function checkHarness(): { available: boolean; paths: HarnessCheck[]; found: string | null } {
  const cwd = process.cwd();
  const rp = (process as any).resourcesPath as string | undefined;

  const candidates: string[] = [];
  for (const name of HARNESS_NAMES) {
    candidates.push(
      join(cwd, 'dist', name),
      join(cwd, '..', 'dist', name),
      join(cwd, name),
      join(currentDir, '../../../dist/', name),
      join(currentDir, '../../dist/', name),
      join(currentDir, '..', 'dist', name),
    );
  }

  if (rp) {
    for (const name of HARNESS_NAMES) {
      candidates.push(
        join(rp, 'harness', name),
        join(rp, name),
        join(rp, '..', 'harness', name),
        join(rp, '..', 'dist', name),
      );
    }
  }

  const paths = candidates
    .filter(Boolean)
    .map((p) => ({ path: p, exists: existsSync(p as string) }));
  const found = paths.find((p) => p.exists)?.path ?? null;
  return { available: found !== null, paths, found };
}

// ── Workflow helpers ────────────────────────────────────────────────────────

export interface WorkflowStats {
  nodeCount: number;
  edgeCount: number;
  isolatedNodes: number;
  reachableNodes: number;
}

export function computeWorkflowStats(graph: { nodes: unknown[]; edges: unknown[] } | null | undefined): WorkflowStats {
  if (!graph) return { nodeCount: 0, edgeCount: 0, isolatedNodes: 0, reachableNodes: 0 };

  const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
  const edges = Array.isArray(graph.edges) ? graph.edges : [];

  const incident = new Set<string>();
  for (const e of edges as any[]) {
    if (e?.source) incident.add(String(e.source));
    if (e?.target) incident.add(String(e.target));
  }

  const isolated = nodes.filter((n: any) => !incident.has(String(n?.id ?? ''))).length;
  return {
    nodeCount: nodes.length,
    edgeCount: edges.length,
    isolatedNodes: isolated,
    reachableNodes: nodes.length - isolated,
  };
}

// ─── Routes ─────────────────────────────────────────────────────────────────

export function registerHealthRoutes(app: FastifyInstance): void {
  app.get('/api/v1/health/details', async () => {
    const schema = checkSchema();
    const harness = checkHarness();
    const resourcesPath = ((process as any).resourcesPath as string | undefined) ?? null;
    // Packaged flag — pre-computed from .asar / .exe / resourcesPath tests
    const packaged = __isPackaged;

    const startTime = (globalThis as any).__serverStartTime ?? Date.now();
    (globalThis as any).__serverStartTime = startTime;

    return {
      backend: 'ok' as const,
      uptimeMs: Date.now() - startTime,
      playbookCount: listPlaybooks().length,
      playbooks: listPlaybooks().map((p) => ({ id: p.id, name: p.name, category: p.category, stages: p.stages.length })),
      schema: {
        available: schema.available,
        path: schema.found,
        candidates: schema.paths,
      },
      harness: {
        available: harness.available,
        path: harness.found,
        candidates: harness.paths,
      },
      packaged,
      resourcesPath,
      cwd: process.cwd(),
      version: (() => {
        try {
          // Walk up to find package.json
          let dir = currentDir;
          for (let i = 0; i < 5; i++) {
            const pkg = join(dir, 'package.json');
            if (existsSync(pkg)) {
              // eslint-disable-next-line @typescript-eslint/no-var-requires
              const pkgData = require(pkg);
              return pkgData.version ?? 'unknown';
            }
            dir = dirname(dir);
          }
        } catch { /* ignore */ }
        return 'unknown';
      })(),
    };
  });

  app.get('/api/v1/orgs/:orgId/workflow/stats', async (req) => {
    const { orgId } = req.params as { orgId: string };
    const empty = { nodeCount: 0, edgeCount: 0, isolatedNodes: 0, reachableNodes: 0 };
    const store = (req.server as any)._orgStore;
    if (!store) return empty;
    try {
      const org = store.get(orgId) as any;
      if (!org) return empty;
      const workflow = org?.org?.workflow ?? org?.workflow ?? null;
      return computeWorkflowStats(workflow);
    } catch {
      return empty;
    }
  });
}
