# Org Engine Editor Redesign Implementation Plan

> **For agentic workers:** Use subagent-driven-development to implement plan task-by-task.

**Goal:** Transform Org Engine Editor from a config editor into a multi-agent orchestration workbench with Cold Luxury industrial design, playbook system, and three-panel execution console.

**Architecture:** Backend Fastify API with playbook engine + apply endpoint; Frontend React + Tailwind v4 + ReactFlow + Three.js; Desktop Electron shell with health diagnostics. 9 phases delivered incrementally.

**Tech Stack:** Fastify 5 + TypeScript (backend), React 19 + Vite 6 + Tailwind v4 + motion + @xyflow/react (frontend), Electron 33 (desktop), Three.js (GlassLens)

---

## File Structure

### Backend files to modify/create:
- `backend-server/src/templates/template-engine.ts` — playbook engine (extend existing)
- `backend-server/src/templates/template.routes.ts` — playbook API routes
- `backend-server/src/templates/built-in/` — 4 built-in playbooks
- `backend-server/src/server.ts` — register routes
- `backend-server/src/health/` — new health diagnostics module

### Frontend files to modify/create:
- `frontend/src/api/client.ts` — add playbook API methods
- `frontend/src/components/playbook/` — new playbook components
- `frontend/src/views/StudioView.tsx` — restructure tabs
- `frontend/src/views/RunMonitorView.tsx` — three-panel layout
- `frontend/src/components/ValidationPanel.tsx` — new validation UI
- `frontend/src/components/RunPanel.tsx` — new run launcher
- `frontend/src/components/health/` — new health panel

### Design system:
- `frontend/src/styles/globals.css` — existing tokens (keep)
- `docs/design/craft/` — new craft rule docs

---

## Phase 1: Stabilize Build

### Task 1.1: Fix remaining TypeScript errors

**Files:**
- Modify: `frontend/src/components/showcase/GlassLens.tsx`
- Modify: `frontend/src/views/HomeView.tsx`
- Modify: `frontend/src/views/RunMonitorView.tsx`
- Modify: `frontend/src/components/templates/TemplateCard.tsx`
- Modify: `frontend/src/views/SkillsView.tsx`

- [ ] **Step 1: Fix GlassLens container null-check**

The handleResize closure captures `container` which is narrowed by `if (!container) return` but TypeScript doesn't carry the narrowing into the nested function. Add guard.

Edit `GlassLens.tsx` around the resize handler:
```typescript
function handleResize() {
  if (!container) return;  // null guard
  const w = container.clientWidth;
  const h = container.clientHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}
```

- [ ] **Step 2: Fix HomeView fadeUp transition typing**

The `ease` array needs `as const` for Motion 12's `Easing` type.

Edit `HomeView.tsx`:
```typescript
const fadeUp = (d: number) => ({
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.55, delay: d, ease: [0.16, 1, 0.3, 1] as const },
});
```

- [ ] **Step 3: Fix Badge variant type mismatches**

The new Badge in `badge.tsx` removed `"secondary"` variant. Run `cd frontend && npx tsc --noEmit` and fix all Badge `variant="secondary"` → `variant="muted"` across all files.

- [ ] **Step 4: Run tests to verify state**

Run: `cd backend-server && npx vitest run && cd ../frontend && npx tsc --noEmit`
Expected: All tests pass (19), 0 TypeScript errors.

### Task 1.2: Rename templates to playbooks (backend)

**Files:**
- Modify: `backend-server/src/templates/index.ts`
- Modify: `backend-server/src/templates/template-engine.ts`
- Modify: `backend-server/src/templates/template.routes.ts`
- Create: `backend-server/src/playbooks/built-in/` (copy built-ins)

- [ ] **Step 1: Create backend playbook directory**

```bash
mkdir -p backend-server/src/playbooks/built-in
```

- [ ] **Step 2: Copy built-in templates to playbooks with new type**

Copy each built-in as `.ts` file. The playbook types live in a new `types.ts`:

Edit `backend-server/src/playbooks/types.ts`:
```typescript
export type TriggerKind = 'manual' | 'schedule' | 'event';
export type SourceKind = 'org' | 'run' | 'upload' | 'url';
export type StageKind = 'validate' | 'transform' | 'execute' | 'review' | 'export';
export type OutputSink = 'org' | 'run' | 'export' | 'memory';
export type PlaybookCategory = 'scaffold' | 'audit' | 'deploy' | 'research' | 'custom';

export interface PlaybookParameter {
  key: string;
  label: string;
  type: 'string' | 'number' | 'boolean' | 'select' | 'textarea';
  required?: boolean;
  defaultValue?: unknown;
  options?: { label: string; value: string }[];
  help?: string;
}

export interface PlaybookStage {
  id: string;
  kind: StageKind;
  title: string;
  config?: Record<string, unknown>;
  dependsOn?: string[];
  allowedAgentTypes?: string[];
}

export interface WorkflowPlaybook {
  id: string;
  name: string;
  description: string;
  category: PlaybookCategory;
  recommendedFor: string[];
  triggerKinds: TriggerKind[];
  sourceKinds: SourceKind[];
  stages: PlaybookStage[];
  outputSinks: OutputSink[];
  tags: string[];
  parameters: PlaybookParameter[];
  graph: { nodes: unknown[]; edges: unknown[] };
  builtIn: boolean;
}
```

- [ ] **Step 3: Create playbook engine**

Edit `backend-server/src/playbooks/engine.ts`:
```typescript
import { WorkflowPlaybook } from './types';

const playbooks = new Map<string, WorkflowPlaybook>();

export function registerPlaybook(p: WorkflowPlaybook): void {
  playbooks.set(p.id, p);
}

export function listPlaybooks(category?: string): WorkflowPlaybook[] {
  const all = Array.from(playbooks.values());
  return category && category !== 'all'
    ? all.filter(p => p.category === category)
    : all;
}

export function getPlaybook(id: string): WorkflowPlaybook | undefined {
  return playbooks.get(id);
}

export function generateFallbackGraph(p: WorkflowPlaybook): { nodes: unknown[]; edges: unknown[] } {
  if (p.graph.nodes.length > 0 || p.graph.edges.length > 0) return p.graph;
  const nodes = p.stages.map((s, i) => ({
    id: s.id,
    type: s.kind === 'validate' ? 'default' : s.kind === 'execute' ? 'default' : 'default',
    position: { x: i * 250, y: 100 },
    data: { label: s.title, kind: s.kind },
  }));
  const edges = p.stages.slice(1).map((s, i) => ({
    id: `e-${p.stages[i].id}-${s.id}`,
    source: p.stages[i].id,
    target: s.id,
  }));
  return { nodes, edges };
}

export async function applyPlaybook(
  id: string,
  mode: 'create_org' | 'apply_to_org' | 'workflow_only',
  params: Record<string, unknown>,
  orgId?: string,
): Promise<{ success: boolean; orgId?: string; workflow: { nodes: unknown[]; edges: unknown[] }; message: string }> {
  const p = playbooks.get(id);
  if (!p) throw new Error('Playbook not found');
  const graph = generateFallbackGraph(p);
  // mode-specific logic when org config is needed
  let resultOrgId = orgId;
  if (mode === 'create_org') {
    resultOrgId = `org_${Date.now()}`;
    // In real impl, save org config here
  }
  return { success: true, orgId: resultOrgId, workflow: graph, message: `Playbook "${p.name}" applied` };
}
```

- [ ] **Step 4: Register playbook routes**

Edit `backend-server/src/playbooks/routes.ts`:
```typescript
import type { FastifyInstance } from 'fastify';
import { listPlaybooks, getPlaybook, applyPlaybook } from './engine';

export function registerPlaybookRoutes(app: FastifyInstance): void {
  app.get('/api/v1/playbooks', async req => {
    const { category } = req.query as { category?: string };
    return listPlaybooks(category);
  });
  app.get('/api/v1/playbooks/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const p = getPlaybook(id);
    if (!p) return reply.status(404).send({ error: 'Playbook not found' });
    return p;
  });
  app.post('/api/v1/playbooks/:id/apply', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as any;
    try {
      return await applyPlaybook(id, body.mode, body.params || {}, body.orgId);
    } catch (err: any) {
      return reply.status(404).send({ error: err.message });
    }
  });
}
```

- [ ] **Step 5: Keep old templates endpoint for backward compat**

Edit `backend-server/src/server.ts` — register both old template routes and new playbook routes.

- [ ] **Step 6: Run TypeScript check**

Run: `cd backend-server && npx tsc --noEmit`
Expected: 0 errors.

---

## Phase 2: Backend Playbook API

### Task 2.1: Built-in playbooks with parameters and graph

**Files:**
- Create: `backend-server/src/playbooks/built-in/org-scaffold.ts`
- Create: `backend-server/src/playbooks/built-in/audit-run.ts`
- Create: `backend-server/src/playbooks/built-in/deploy-pipeline.ts`
- Create: `backend-server/src/playbooks/built-in/research-flow.ts`

- [ ] **Step 1: Org Scaffold playbook**

Create `backend-server/src/playbooks/built-in/org-scaffold.ts`:
```typescript
import { registerPlaybook } from '../engine';

registerPlaybook({
  id: 'org-scaffold',
  name: 'Org Scaffold',
  description: 'Create a new organization with departments, roles, and budget in sequence',
  category: 'scaffold',
  recommendedFor: ['Setting up a new multi-agent team from scratch'],
  triggerKinds: ['manual'],
  sourceKinds: ['org'],
  stages: [
    { id: 's1', kind: 'validate', title: 'Validate org config', dependsOn: [] },
    { id: 's2', kind: 'transform', title: 'Apply role templates', dependsOn: ['s1'] },
    { id: 's3', kind: 'review', title: 'Review generated structure', dependsOn: ['s2'] },
    { id: 's4', kind: 'export', title: 'Export final config', dependsOn: ['s3'] },
  ],
  outputSinks: ['org', 'export'],
  tags: ['scaffold', 'org', 'onboarding'],
  parameters: [
    { key: 'orgName', label: 'Organization name', type: 'string', required: true, defaultValue: 'my_org', help: 'URL-safe identifier, e.g. my_org' },
    { key: 'departments', label: 'Department list', type: 'textarea', defaultValue: 'Architecture\nExecution\nReview', help: 'One department name per line' },
    { key: 'budget', label: 'Max depth', type: 'number', defaultValue: 3, help: '1-5, max delegation depth' },
  ],
  graph: { nodes: [], edges: [] },
  builtIn: true,
});
```

- [ ] **Step 2: Audit Run playbook**

Create `backend-server/src/playbooks/built-in/audit-run.ts`:
```typescript
import { registerPlaybook } from '../engine';

registerPlaybook({
  id: 'audit-run',
  name: 'Audit Run',
  description: 'Validate org config, execute skills against it, review results, generate report',
  category: 'audit',
  recommendedFor: ['Compliance checks', 'Pre-deployment audit', 'Quarterly org review'],
  triggerKinds: ['manual', 'schedule'],
  sourceKinds: ['org', 'run'],
  stages: [
    { id: 's1', kind: 'validate', title: 'Validate org config', dependsOn: [] },
    { id: 's2', kind: 'execute', title: 'Execute skills against org', dependsOn: ['s1'] },
    { id: 's3', kind: 'review', title: 'Review results', dependsOn: ['s2'] },
    { id: 's4', kind: 'export', title: 'Generate report', dependsOn: ['s3'] },
  ],
  outputSinks: ['run', 'export'],
  tags: ['audit', 'compliance', 'review'],
  parameters: [
    { key: 'auditScope', label: 'Audit scope', type: 'select', required: true, defaultValue: 'full', options: [
      { label: 'Security', value: 'security' },
      { label: 'Performance', value: 'performance' },
      { label: 'Full review', value: 'full' },
    ]},
  ],
  graph: { nodes: [], edges: [] },
  builtIn: true,
});
```

- [ ] **Step 3: Deploy Pipeline playbook**

Create `backend-server/src/playbooks/built-in/deploy-pipeline.ts`:
```typescript
import { registerPlaybook } from '../engine';

registerPlaybook({
  id: 'deploy-pipeline',
  name: 'Deploy Pipeline',
  description: 'Export config as YAML, validate, deploy to target, verify deployment',
  category: 'deploy',
  recommendedFor: ['Deploying org config changes', 'CI/CD integration for agent teams'],
  triggerKinds: ['manual', 'event'],
  sourceKinds: ['org'],
  stages: [
    { id: 's1', kind: 'export', title: 'Export config as YAML', dependsOn: [] },
    { id: 's2', kind: 'validate', title: 'Validate exported config', dependsOn: ['s1'] },
    { id: 's3', kind: 'execute', title: 'Deploy to target', dependsOn: ['s2'] },
    { id: 's4', kind: 'review', title: 'Verify deployment', dependsOn: ['s3'] },
  ],
  outputSinks: ['export'],
  tags: ['deploy', 'pipeline', 'ci-cd'],
  parameters: [
    { key: 'targetEnv', label: 'Target environment', type: 'select', required: true, defaultValue: 'staging', options: [
      { label: 'Development', value: 'dev' },
      { label: 'Staging', value: 'staging' },
      { label: 'Production', value: 'production' },
    ]},
    { key: 'deployStrategy', label: 'Deployment strategy', type: 'select', defaultValue: 'rolling', options: [
      { label: 'Rolling update', value: 'rolling' },
      { label: 'Blue-green', value: 'blue-green' },
      { label: 'Recreate', value: 'recreate' },
    ]},
  ],
  graph: { nodes: [], edges: [] },
  builtIn: true,
});
```

- [ ] **Step 4: Research Flow playbook**

Create `backend-server/src/playbooks/built-in/research-flow.ts`:
```typescript
import { registerPlaybook } from '../engine';

registerPlaybook({
  id: 'research-flow',
  name: 'Research Flow',
  description: 'Parallel researchers synthesize findings into a comprehensive report',
  category: 'research',
  recommendedFor: ['Market research', 'Technical investigation', 'Competitor analysis'],
  triggerKinds: ['manual'],
  sourceKinds: ['org', 'url'],
  stages: [
    { id: 's1', kind: 'execute', title: 'Parallel research by agents', dependsOn: [] },
    { id: 's2', kind: 'transform', title: 'Synthesize findings', dependsOn: ['s1'] },
    { id: 's3', kind: 'review', title: 'Editor review', dependsOn: ['s2'] },
    { id: 's4', kind: 'export', title: 'Export report', dependsOn: ['s3'] },
  ],
  outputSinks: ['org', 'export'],
  tags: ['research', 'crewai-pattern', 'report'],
  parameters: [
    { key: 'researchQuery', label: 'Research question', type: 'textarea', required: true, help: 'What do you want to research?' },
    { key: 'depth', label: 'Research depth', type: 'select', defaultValue: 'standard', options: [
      { label: 'Quick scan', value: 'quick' },
      { label: 'Standard', value: 'standard' },
      { label: 'Deep dive', value: 'deep' },
    ]},
  ],
  graph: { nodes: [], edges: [] },
  builtIn: true,
});
```

- [ ] **Step 5: Register all built-in playbooks**

Create `backend-server/src/playbooks/built-in/index.ts`:
```typescript
import './org-scaffold';
import './audit-run';
import './deploy-pipeline';
import './research-flow';
```

- [ ] **Step 6: Wire into server**

Edit `backend-server/src/server.ts` — replace old template imports with playbook imports:
```typescript
// Remove: import { registerTemplateRoutes } from './templates/index.js';
// Add:
import { registerPlaybookRoutes } from './playbooks/routes.js';
import './playbooks/built-in/index';

// Remove: registerTemplateRoutes(app);
// Add:
registerPlaybookRoutes(app);
```

- [ ] **Step 7: Test playbook API**

Run: `curl -s http://localhost:5172/api/v1/playbooks` (requires backend running)
Expected: Array of 4 playbooks with parameters, stages, generated graph.

---

## Phase 3: Frontend Playbook Gallery

### Task 3.1: Add playbook API methods to client

**Files:**
- Modify: `frontend/src/api/client.ts`

- [ ] **Step 1: Add playbook API methods**

Edit `frontend/src/api/client.ts`, add before the closing `};`:
```typescript
  // Playbooks
  listPlaybooks: (category?: string) =>
    request<any[]>(`/api/v1/playbooks${category && category !== 'all' ? `?category=${category}` : ''}`),
  getPlaybook: (id: string) =>
    request<any>(`/api/v1/playbooks/${id}`),
  applyPlaybook: (id: string, mode: string, params: Record<string, unknown>, orgId?: string) =>
    request<any>(`/api/v1/playbooks/${id}/apply`, {
      method: 'POST',
      body: JSON.stringify({ mode, params, orgId }),
    }),
```

### Task 3.2: Build Playbook Gallery UI

**Files:**
- Create: `frontend/src/components/playbook/PlaybookLibrary.tsx`
- Create: `frontend/src/components/playbook/PlaybookCard.tsx`
- Create: `frontend/src/components/playbook/PlaybookDetailPanel.tsx`
- Create: `frontend/src/components/playbook/PlaybookParameterForm.tsx`
- Create: `frontend/src/components/playbook/PlaybookGraphPreview.tsx`

- [ ] **Step 1: Create PlaybookCard component**

Create `frontend/src/components/playbook/PlaybookCard.tsx`:
```tsx
'use client';

import { Card, CardContent, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowUpRight, Layers } from 'lucide-react';

interface PlaybookCardProps {
  playbook: {
    id: string;
    name: string;
    description: string;
    category: string;
    stages: any[];
    tags: string[];
    builtIn: boolean;
  };
  onPreview: (id: string) => void;
}

export function PlaybookCard({ playbook, onPreview }: PlaybookCardProps) {
  return (
    <Card
      variant="flat"
      className="cursor-pointer group hover:border-accent/40 transition-colors duration-200"
      onClick={() => onPreview(playbook.id)}
    >
      <CardContent className="flex flex-col gap-2 pt-5">
        <div className="flex items-center justify-between">
          <CardTitle>{playbook.name}</CardTitle>
          <ArrowUpRight size={14} className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity -mt-1" />
        </div>
        <p className="text-[12.5px] text-muted-foreground leading-relaxed line-clamp-2">
          {playbook.description}
        </p>
        <div className="flex items-center gap-2 mt-1">
          <Badge variant="accent" className="text-[10px]">{playbook.category}</Badge>
          <span className="mono-num text-[10.5px] text-muted-foreground">
            <Layers size={11} className="inline mr-1" />
            {playbook.stages.length} stages
          </span>
        </div>
        <div className="flex gap-1 flex-wrap mt-1">
          {playbook.tags.slice(0, 3).map(tag => (
            <Badge key={tag} variant="muted" className="text-[9px]">{tag}</Badge>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Create PlaybookParameterForm**

Create `frontend/src/components/playbook/PlaybookParameterForm.tsx`:
```tsx
'use client';

import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

interface Param {
  key: string;
  label: string;
  type: string;
  required?: boolean;
  defaultValue?: unknown;
  options?: { label: string; value: string }[];
  help?: string;
}

interface Props {
  parameters: Param[];
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  errors: Record<string, string>;
}

export function PlaybookParameterForm({ parameters, values, onChange, errors }: Props) {
  if (parameters.length === 0) {
    return <p className="text-[12px] text-muted-foreground font-mono">No parameters required</p>;
  }
  return (
    <div className="space-y-3">
      {parameters.map(p => (
        <div key={p.key} className="space-y-1">
          <Label className="text-[12px] font-mono">
            {p.label}
            {p.required && <span className="text-destructive ml-1">*</span>}
          </Label>
          {p.type === 'select' && p.options ? (
            <select
              className="flex h-9 w-full rounded-sm border border-border bg-background px-3 py-2 font-mono text-[12.5px] chrome-hairline"
              value={(values[p.key] as string) ?? (p.defaultValue as string) ?? ''}
              onChange={e => onChange(p.key, e.target.value)}
            >
              {p.options.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          ) : p.type === 'textarea' ? (
            <textarea
              className="flex h-20 w-full rounded-sm border border-border bg-background px-3 py-2 font-mono text-[12.5px] chrome-hairline"
              value={(values[p.key] as string) ?? (p.defaultValue as string) ?? ''}
              onChange={e => onChange(p.key, e.target.value)}
            />
          ) : (
            <Input
              type={p.type === 'number' ? 'number' : 'text'}
              value={(values[p.key] as string) ?? (p.defaultValue as string) ?? ''}
              onChange={e => onChange(p.key, e.target.value)}
            />
          )}
          {p.help && <p className="text-[10.5px] text-muted-foreground">{p.help}</p>}
          {errors[p.key] && <p className="text-[10.5px] text-destructive">{errors[p.key]}</p>}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Create PlaybookLibrary**

Create `frontend/src/components/playbook/PlaybookLibrary.tsx`:
```tsx
'use client';

import { useEffect, useState } from 'react';
import { PlaybookCard } from './PlaybookCard';
import { PlaybookDetailPanel } from './PlaybookDetailPanel';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/api';

const categories = [
  { value: 'all', label: 'All' },
  { value: 'scaffold', label: 'Scaffold' },
  { value: 'audit', label: 'Audit' },
  { value: 'deploy', label: 'Deploy' },
  { value: 'research', label: 'Research' },
];

export function PlaybookLibrary() {
  const [playbooks, setPlaybooks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState('all');
  const [previewId, setPreviewId] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    api.listPlaybooks(activeCategory === 'all' ? undefined : activeCategory)
      .then(setPlaybooks)
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, [activeCategory]);

  if (loading) {
    return <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
      {[1, 2, 3].map(i => <Skeleton key={i} className="h-36 rounded-md" />)}
    </div>;
  }

  return (
    <div className="p-4">
      <div className="mb-6">
        <h2 className="font-display text-xl font-medium tracking-[-0.01em] mb-1">Playbooks</h2>
        <p className="text-[12.5px] text-muted-foreground max-w-[50ch]">
          Reusable orchestration patterns. Preview to see stages and parameters before applying.
        </p>
      </div>
      {error && <div className="mb-4 p-3 rounded-sm bg-destructive/10 text-destructive text-[12px] font-mono">{error}</div>}
      <Tabs value={activeCategory} onValueChange={setActiveCategory}>
        <TabsList>
          {categories.map(c => <TabsTrigger key={c.value} value={c.value} className="text-[12px]">{c.label}</TabsTrigger>)}
        </TabsList>
        <TabsContent value={activeCategory} className="mt-4">
          {playbooks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <p className="text-muted-foreground">No playbooks found</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {playbooks.map(p => <PlaybookCard key={p.id} playbook={p} onPreview={setPreviewId} />)}
            </div>
          )}
        </TabsContent>
      </Tabs>
      {previewId && <PlaybookDetailPanel playbookId={previewId} onClose={() => setPreviewId(null)} />}
    </div>
  );
}
```

- [ ] **Step 4: Create PlaybookDetailPanel**

Create `frontend/src/components/playbook/PlaybookDetailPanel.tsx`:
```tsx
'use client';

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PlaybookParameterForm } from './PlaybookParameterForm';
import { api } from '@/api';
import { X, Play, ChevronRight, Layers } from 'lucide-react';

interface Props {
  playbookId: string;
  onClose: () => void;
}

export function PlaybookDetailPanel({ playbookId, onClose }: Props) {
  const navigate = useNavigate();
  const [playbook, setPlaybook] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [params, setParams] = useState<Record<string, unknown>>({});
  const [applyMode, setApplyMode] = useState<'workflow_only' | 'create_org' | 'apply_to_org'>('workflow_only');
  const [applying, setApplying] = useState(false);
  const [paramErrors, setParamErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    api.getPlaybook(playbookId)
      .then(p => {
        setPlaybook(p);
        const defaults: Record<string, unknown> = {};
        p.parameters?.forEach((param: any) => {
          if (param.defaultValue !== undefined) defaults[param.key] = param.defaultValue;
        });
        setParams(defaults);
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [playbookId]);

  const handleApply = async () => {
    if (!playbook) return;
    const errs: Record<string, string> = {};
    playbook.parameters?.forEach((p: any) => {
      if (p.required && !params[p.key]) errs[p.key] = `${p.label} is required`;
    });
    if (Object.keys(errs).length > 0) { setParamErrors(errs); return; }
    setParamErrors({});
    setApplying(true);
    try {
      const result = await api.applyPlaybook(playbookId, applyMode, params);
      if (result.workflow) {
        const { useWorkflowStore } = await import('@/stores/workflow-store');
        useWorkflowStore.getState().loadWorkflow(result.workflow.nodes, result.workflow.edges);
      }
      const orgId = result.orgId || 'new';
      navigate(`/studio/${orgId}?tab=workflow&playbook=${playbookId}`);
    } catch (err: any) {
      setError(err instanceof Error ? err.message : 'Apply failed');
    }
    setApplying(false);
  };

  if (loading) return null;
  if (error) return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center" onClick={onClose}>
      <Card variant="glass" className="w-full max-w-lg p-6" onClick={e => e.stopPropagation()}>
        <div className="text-destructive text-sm font-mono">{error}</div>
        <Button size="sm" variant="outline" onClick={onClose} className="mt-3">Close</Button>
      </Card>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center" onClick={onClose}>
      <Card variant="glass" className="w-full max-w-lg max-h-[85vh] overflow-y-auto m-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 pb-3 border-b border-border">
          <div>
            <h3 className="font-display text-lg font-medium tracking-[-0.01em]">{playbook?.name}</h3>
            <Badge variant="accent" className="text-[10px] mt-1">{playbook?.category}</Badge>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X size={18} /></button>
        </div>

        <div className="p-5 space-y-5">
          {/* Description */}
          <p className="text-[13px] text-muted-foreground leading-relaxed">{playbook?.description}</p>

          {/* Pipeline preview */}
          <div>
            <h4 className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground mb-2">Pipeline</h4>
            <div className="flex items-center gap-1 flex-wrap">
              {playbook?.stages?.map((s: any, i: number) => (
                <span key={s.id} className="flex items-center gap-1">
                  <Badge variant="default" className="text-[9.5px]">{s.title}</Badge>
                  {i < playbook.stages.length - 1 && <ChevronRight size={12} className="text-muted-foreground" />}
                </span>
              ))}
            </div>
          </div>

          {/* Parameters */}
          <div>
            <h4 className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground mb-2">Parameters</h4>
            <PlaybookParameterForm parameters={playbook?.parameters || []} values={params} onChange={(k, v) => setParams(p => ({...p, [k]: v}))} errors={paramErrors} />
          </div>

          {/* Apply mode */}
          <div>
            <h4 className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground mb-2">Apply Mode</h4>
            <div className="flex gap-2">
              {(['workflow_only', 'create_org', 'apply_to_org'] as const).map(mode => (
                <button
                  key={mode}
                  className={`px-3 py-1.5 rounded-sm text-[11px] font-mono border transition-colors ${
                    applyMode === mode ? 'bg-accent text-accent-foreground border-accent' : 'border-border text-muted-foreground hover:text-foreground'
                  }`}
                  onClick={() => setApplyMode(mode)}
                >
                  {mode === 'workflow_only' ? 'Load workflow' : mode === 'create_org' ? 'Create org' : 'Apply to org'}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="p-5 pt-0 flex gap-2">
          <Button variant="accent" size="lg" className="flex-1" onClick={handleApply} disabled={applying}>
            <Play size={14} />
            {applying ? 'Applying...' : 'Apply Playbook'}
          </Button>
          <Button variant="outline" size="lg" onClick={onClose}>Cancel</Button>
        </div>
      </Card>
    </div>
  );
}
```

- [ ] **Step 5: Update router to use PlaybookLibrary**

Edit `frontend/src/router.tsx` — replace `TemplateLibrary` import and reference with `PlaybookLibrary`.

- [ ] **Step 6: TypeScript check + build**

Run: `cd frontend && npx tsc --noEmit && npx vite build`
Expected: 0 errors, build succeeds.

---

## Phase 4: Studio Tab Restructure

### Task 4.1: Restructure StudioView tabs

**Files:**
- Modify: `frontend/src/views/StudioView.tsx`

- [ ] **Step 1: Update tab structure**

Replace the old Tree/Canvas/Workflow tab bar with:
```
Structure | Workflow | Skills | Validation | Run
```

Read query params `?tab=` and `?playbook=` on mount. Structure tab contains local Tree/Graph mode toggle.

- [ ] **Step 2: TypeScript check**

Expected: 0 errors.

---

## Phase 5 + 6: Validation/Run tabs + Run Monitor

**Files:**
- Create: `frontend/src/components/ValidationPanel.tsx`
- Create: `frontend/src/components/RunPanel.tsx`
- Modify: `frontend/src/views/RunMonitorView.tsx`

Implementation detail: Validation tab checks org schema, skills, workflow graph. Run tab launches with validation gate. Run Monitor gets 3-panel layout (Timeline/Event Stream/Gateway).

---

## Phase 7: Health Diagnostics

**Files:**
- Create: `backend-server/src/health/routes.ts`
- Create: `frontend/src/components/health/HealthPanel.tsx`

Backend endpoint returns health details. Frontend panel shows check statuses.

---

## Phase 8: Electron Rebuild

- Run build pipeline
- Package with electron-builder
- Smoke test

---

## Phase 9: Craft Documentation

- Create `docs/design/craft/` with color, typography, animation, anti-ai-slop rules
