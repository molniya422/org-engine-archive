# Org Engine Editor — Product Redesign Spec

Date: 2026-07-29
Project: D:\claude-ecosystem\org-engine-editor
Target: release/win-unpacked/Org Engine Editor.exe
Design Language: Cold Luxury — industrial-grade multi-agent orchestration workbench

## 1. Product Philosophy

Org Engine Editor is a desktop multi-agent orchestration workbench. Its users are advanced technical operators building AI agent teams. The product must feel like a precision instrument — not a configuration panel.

### Design Dials

```
DESIGN_VARIANCE: 7  — asymmetric chrome, exhibition-pedestal layout, functional asymmetry
MOTION_INTENSITY: 6 — meaningful only: page entry, state transitions, execution progress
VISUAL_DENSITY: 5    — compact data density, generous whitespace for premium surfaces
```

### Influences

- **Ruflo / multi-agent orchestration** — Swarm topology (Queen-led hierarchical, mesh), anti-drift consistency, goal-planning with A* decomposition, federated agent communication, learning-from-trajectory loops
- **Open Design / craft system** — anti-AI-slop rules, color discipline (one accent ≤ 2 uses/screen), typography craft (ALL CAPS tracking, type scale), animation discipline (150ms baseline), laws-of-UX composition
- **Cold Luxury** — off-black charcoal base, ice-blue single accent, chrome hairlines, Geist Display + Geist Mono

### Design System Ownership

| Layer | Purpose | Source of Truth |
|---|---|---|
| **Design tokens** | Theme, color, typography, spacing | `frontend/src/styles/globals.css` |
| **Craft rules** | Anti-AI-slop, color discipline, animation | `docs/design/craft/` |
| **Component library** | shadcn/ui primitives (owned code) | `frontend/src/components/ui/` |
| **Showcase components** | Three.js GlassLens, glass panels | `frontend/src/components/showcase/` |

## 2. Product Information Architecture

The app reorganizes into five functional areas that mirror the user's mental model of: **start → configure → validate → execute → inspect**.

```
┌──────────────────────────────────────────────────────┐
│                   Command Deck (Home)                  │
│  ┌────────────┐ ┌──────────┐ ┌────────┐ ┌─────────┐  │
│  │ Playbooks   │ │ Orgs     │ │ Skills  │ │ Health  │  │
│  │ (Templates) │ │ Active   │ │ Registry│ │ Status  │  │
│  └────────────┘ └──────────┘ └────────┘ └─────────┘  │
├──────────────────────────────────────────────────────┤
│                    Studio                             │
│  Structure │ Workflow │ Skills │ Validation │ Run      │
│  ┌───────┐ ┌────────┐ ┌──────┐ ┌──────────┐ ┌────┐  │
│  │ Org   │ │ Graph   │ │ Bind │ │ Gate      │ │Launch│ │
│  │ Tree  │ │ Editor  │ │ Skills│ │ Checks   │ │ Task│  │
│  └───────┘ └────────┘ └──────┘ └──────────┘ └────┘  │
├──────────────────────────────────────────────────────┤
│              Execution Console (Run Monitor)           │
│  ┌──────────┐ ┌──────────────┐ ┌───────────────────┐  │
│  │ Timeline  │ │ Event Stream  │ │ Gateway Decision |  │
│  └──────────┘ └──────────────┘ └───────────────────┘  │
├──────────────────────────────────────────────────────┤
│              Diagnostics & Package Health              │
└──────────────────────────────────────────────────────┘
```

### 2.1 Command Deck (Home)

Home is the control center, not a hero showcase.

**Components:**
- **Organization swarm list** — each org shown as a "swarm card" with agent count, skill coverage, last run, validation state
- **Active run indicator** — persistent bar if a run is in progress, with jump-link to execution console
- **Playbook gallery entry** — browse orchestration templates
- **Skill registry entry** — view scanned skill pool
- **Health summary** — backend status, template count, schema path, harness path
- **Quick actions** — new org, from template, rescan skills

**Visual constraints (from craft system):**
- Hero area uses GlassLens as atmosphere (low visual weight, right-aligned)
- At most 1 accent-colored CTA per screen (neutral for secondary actions)
- No emoji as icons — all icons from lucide-react
- ALL CAPS labels require `letter-spacing: 0.08em`
- Section spacing: asymmetric (tight hero, breathing org grid)

### 2.2 Playbook Gallery (Templates)

Templates are renamed to **Playbooks** — the term better communicates "reusable orchestration pattern that launches a workflow."

**User path:**

```
Playbook Gallery
  → Select playbook card
  → Playbook Detail Drawer
    → Pipeline preview (stages as timeline)
    → Workflow graph preview (X6-style auto-layout)
    → Parameter configuration
    → Choose apply mode
  → Apply
  → Navigate to Studio Workflow tab
```

**Playbook data model (extended):**

```typescript
interface PlaybookParameter {
  key: string;
  label: string;
  type: 'string' | 'number' | 'boolean' | 'select' | 'textarea';
  required?: boolean;
  defaultValue?: unknown;
  options?: { label: string; value: string }[];
  help?: string;
}

interface PlaybookStage {
  id: string;
  kind: 'validate' | 'transform' | 'execute' | 'review' | 'export';
  title: string;
  config?: Record<string, unknown>;
  dependsOn?: string[];          // stage dependency graph
  allowedAgentTypes?: string[];  // what kind of agent runs this
}

interface WorkflowPlaybook {
  id: string;
  name: string;
  description: string;
  category: 'scaffold' | 'audit' | 'deploy' | 'research' | 'custom';
  recommendedFor: string[];
  triggerKinds: ('manual' | 'schedule' | 'event')[];
  sourceKinds: ('org' | 'run' | 'upload' | 'url')[];
  stages: PlaybookStage[];
  outputSinks: ('org' | 'run' | 'export' | 'memory')[];
  tags: string[];
  parameters: PlaybookParameter[];
  graph: { nodes: unknown[]; edges: unknown[] };
  builtIn: boolean;
}
```

**Apply endpoint:**

```
POST /api/v1/templates/:id/apply
{
  mode: 'create_org' | 'apply_to_org' | 'workflow_only',
  orgId?: string,
  params: Record<string, unknown>
}

→ {
  success: true,
  orgId?: string,
  workflow: { nodes: unknown[], edges: unknown[] },
  message: string
}
```

**Fallback graph generation:**
If `graph.nodes`/`graph.edges` are empty, backend generates from `stages`:
- One ReactFlow node per stage, connected in dependency order
- Node type mapped from stage kind (validate=checkmark, execute=play, etc.)
- Auto-layout via dagre

**Built-in playbooks (minimum):**
| Playbook | Category | Stages | Parameters |
|---|---|---|---|
| Org Scaffold | scaffold | validate → transform → review → export | orgName, departments |
| Audit Run | audit | validate → execute → review → export | auditScope |
| Deploy Pipeline | deploy | export → validate → execute → review | targetEnv, deployStrategy |
| Research Flow | research | execute → transform → review → export | researchQuery, depth |

Each playbook includes `recommendedFor`, explicit stages with `dependsOn`, non-empty graph, and at least one required parameter.

**UI/UX constraints:**
- Playbook cards show: name, category badge, stage count, filterable by category
- Preview is the primary action (not Apply) — apply requires confirming intent
- Parameter forms use the existing shadcn/ui Input, Select, Textarea components
- Apply mode selector: "Create new org" | "Apply to current org" | "Load workflow only"
- Errors: inline banner for API failure, field-level validation for parameters
- Success: navigate to `/studio/:orgId?tab=workflow&playbook=:id`

### 2.3 Studio — The Workbench

Studio is the central workspace for building and verifying an orchestration before execution.

**Tab structure (replaces Tree View / Canvas View / Workflow):**

```
Structure | Workflow | Skills | Validation | Run
```

#### 2.3.1 Structure Tab

Combines tree and graph into one view with a local view mode toggle:

```
Tree | Graph ← segmented control
```

- **Tree mode:** department hierarchy, role list, add department/role
- **Graph mode:** organization structure as a node graph (custom nodes for departments, roles grouped inside)
- **Right panel:** RoleEditor (agent type, bound skill, prompt vars, context note)

#### 2.3.2 Workflow Tab

Workflow graph editor using ReactFlow (xyflow).

- **WorkflowCanvas** — main graph area, custom nodes per stage type
- **WorkflowToolbar** — add node, connect, layout, zoom controls
- **PropertiesPanel** — right sidebar for selected node/edge configuration
- **Playbook imported badge** — visible if loaded from a playbook
- **Reset / Save** — session-local only (phase 1); note visible to user
- **Dagre auto-layout** — lay out the graph on load from a playbook

#### 2.3.3 Skills Tab

Organization-aware skill validation.

- Skills referenced by the current org's roles
- Scanned skill pool (from backend)
- Missing skills with warning indicators
- Role-to-skill mapping table
- Rescan button
- Quick-fix: navigate to missing skill path, or skip

#### 2.3.4 Validation Tab

Pre-flight gate checks before execution. Each check returns:

```typescript
interface ValidationCheck {
  id: string;
  severity: 'pass' | 'warning' | 'error';
  title: string;
  description?: string;
  fixTarget?: 'structure' | 'workflow' | 'skills' | 'settings';
  actionLabel?: string;  // "Fix in Structure" etc.
}
```

**Checks (minimum):**
1. ✅ Schema valid (org YAML passes JSON Schema)
2. ✅ Departments exist and are non-empty
3. ✅ Each role has agentType
4. ✅ Each role's bound_skill exists in skill pool
5. ✅ Workflow graph is non-empty
6. ✅ Workflow has no isolated nodes
7. ⚠️ Harness adapter path available
8. ⚠️ Schema file path available

#### 2.3.5 Run Tab

Task launcher with validation gate.

- **Task textarea** — free-form task description
- **Org summary** — name, department/role count
- **Workflow summary** — node count, edge count, stage sequence
- **Validation summary** — pass/warning/error counts from Validation tab
- **Run button** — disabled if blocking errors exist; shows reason
- **Recent runs** — list of previous runs for this org with status badges
- **On launch:** `startRun(orgId, task)` → navigate to Run Monitor

### 2.4 Execution Console (Run Monitor)

Run Monitor becomes a structured three-panel execution console:

```
┌───────────────────────────────────────────────────┐
│ Header: status / org / task / [Back] [Cancel]     │
├────────────┬────────────────────┬──────────────────┤
│ Timeline   │ Event Stream       │ Gateway Decision │
│            │                    │                  │
│ run_started│ [12:34:56] type    │ Question:       │
│ layer_1    │ agent_started      │ "Approve policy │
│ agent_A    │ [12:34:58] type    │  change?"       │
│ agent_B    │ agent_completed    │                  │
│ gateway_1  │ [12:35:01] log     │ [decision input] │
│ run_done   │ line from stderr   │ [Submit]         │
│            │                    │                  │
└────────────┴────────────────────┴──────────────────┘
```

**Panel behavior:**

| Panel | Content | Interactions |
|---|---|---|
| Timeline | Event sequence: run_started, layer_N, agent_started/completed, gateway_prompt, run_completed | Click event to scroll Event Stream to matching line |
| Event Stream | Structured JSON events + logs + stderr lines | Auto-scroll (toggle), copy all, Pause/Resume |
| Gateway | Active gateway prompt (if awaiting_user) or "No active gateway" | Decision textarea + Submit, last decision history |

**Post-completion:**
- Success/failure banner with duration
- Copy logs, Export report
- Back to Studio

### 2.5 Diagnostics & Package Health

A health surface to diagnose Electron-packaged issues without terminal access.

**Endpoint:**

```
GET /api/v1/health/details
→ {
  backend: 'ok',
  templateCount: number,
  schemaAvailable: boolean,
  harnessAvailable: boolean,
  resourcesPath?: string,
  packaged: boolean
}
```

**Frontend panel:**
- Backend status ✅/❌
- Playbook registry count
- Schema path exists
- Orchestrator adapter .exe path exists
- Packaged vs dev mode
- Accessible from Home footer + AppShell gear icon

## 3. Visual Language — Cold Luxury

Established tokens from `globals.css` are the single source of truth. This section documents design decisions, not token values.

### 3.1 Color Discipline

| Token Role | Constraint |
|---|---|
| Accent (ice-blue) | Max 2 visible uses per screen (one CTA + one chip/eyebrow) |
| Neutral background | Off-black charcoal (no `#000000`), warm off-white for light mode |
| Semantic colors | `success` (emerald), `warning` (amber), `destructive` (red) — ≤1 visible use each |
| Effects | Chrome hairline overlay, not gradients or dropshadows |

**Anti-pattern enforcement:**
- No Tailwind indigo (`#6366f1`, `#4f46e5`, etc.) as accent — the `--accent` token is ice-blue
- No two-stop hero gradients (purple→blue, blue→cyan) — flat surfaces with type hierarchy
- No arbitrary hex values outside `:root` — all colors through CSS vars
- No emoji as icons (`✨🚀🎯⚡🔥💡` in buttons/lists/headings) — lucide-react only
- No invented metrics ("10x faster", "99.9% uptime") — real data or explicit placeholders

### 3.2 Typography

| Context | Font | Rules |
|---|---|---|
| Display (≥32px) | Geist Display | `letter-spacing: -0.02em`, `leading: 1.0–1.2` |
| Body (15–18px) | Geist | `leading: 1.5–1.6`, `max-width: 65ch` |
| UI labels, buttons | Geist | `letter-spacing: 0.02em`, 3-weight system (400/510/590) |
| Mono (data, code) | Geist Mono | `tabular-nums` for figures, `letter-spacing: 0` for body |
| ALL CAPS labels | Geist Mono | **Required:** `letter-spacing: 0.08em–0.1em` |
| Caption (11–12px) | Geist | `letter-spacing: 0.01em–0.02em` |

**Anti-patterns:**
- No sans-serif on display text when a display face is bound
- No `font-family: system-ui` alone on headings — always paired with Geist
- No more than 2 typefaces per view (Geist + Geist Mono count as 1 variable + 1 mono)
- No ALL CAPS without tracking ≥0.06em

### 3.3 Animation

| Duration | Use Case |
|---|---|
| 50–100ms | Button press, toggle commit, hover |
| 150ms | State confirmation, default |
| 200–300ms | Panel enter (modals, sheets, dropdowns) |
| 300–500ms | Cross-screen transitions, container morphs |
| >500ms | Reserved for staged or platform-native transitions |

**Easing:** `cubic-bezier(0.16, 1, 0.3, 1)` — front-loaded, decisive exit.
**Reduced motion:** All transforms respect `prefers-reduced-motion: reduce`. Opacity/color crossfades as fallback.
**Anti-patterns:** No decorative motion in working views (Studio, Run Monitor). No hero choreography in productivity tool. No looping spinners past 60s.

### 3.4 Shape Consistency

| Element | Radius |
|---|---|
| Cards (flat, glass, pedestal) | `rounded-md` (6px) |
| Buttons | `rounded-md` (6px) |
| Inputs | `rounded-sm` (4px) |
| Badges | `rounded-sm` (2px, sharp-corner) |
| Modals | `rounded-lg` (10px) |

One radius system, no mixing of pill buttons with sharp cards.

### 3.5 Component Variants

**Card:**
- `flat` — bordered surface, charcoal fill (default for content cards)
- `glass` — backdrop-blur frosted glass (for hero, overlay surfaces)
- `pedestal` — deep show-floor surface (premium showcase backdrop)

**Button:**
- `default` — charcoal fill with chrome hairline (primary action)
- `accent` — ice-blue fill (premium accent, max 1 per screen)
- `outline` — bordered ghost (secondary)
- `ghost` — no chrome (inline)
- `danger` — destructive action

**Badge:**
- `default` — bordered, mono font, sharp-corner
- `accent` — ice-blue tinted
- `muted` — low visual weight
- `success` / `warning` / `destructive` — semantic states

## 4. API & Data Model

### 4.1 Backend Routes

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/templates` | List playbooks (filter by category) |
| GET | `/api/v1/templates/:id` | Get playbook detail |
| POST | `/api/v1/templates/:id/apply` | Apply playbook (with params + mode) |
| DELETE | `/api/v1/templates/:id` | Delete user-created playbook |
| GET | `/api/v1/health/details` | Package health diagnostics |

### 4.2 Frontend API Layer

All API calls go through `api` client from `client.ts`, not `fetch('/api/...')` directly. Reason: Electron `file://` protocol does not support relative proxy, so every request must resolve the backend port.

## 5. Error Handling

| Error Source | Visible Treatment | Location |
|---|---|---|
| Backend unreachable | Inline banner: "Template service unavailable" | Playbook Gallery, Detail |
| Playbook not found | Inline banner: "Playbook not found" | Detail panel |
| Parameter validation | Inline field error below each field | Parameter form |
| Apply failure | Error banner in Detail panel | Detail panel, above Apply button |
| Workflow load failure | Error toast + remain on Detail | Detail panel |
| Run launch (validation blocking) | Run button disabled with tooltip | Run tab |
| WebSocket disconnect | Connection badge changes to "OFFLINE" | Run Monitor header |

No console-only errors. Every failure path has a visible UI treatment.

## 6. Scope

### In Scope (Phase 1)

- Backend playbook API + apply endpoint
- Built-in playbook graph generation
- Playbook Gallery frontend (library, detail, params, apply)
- Studio tab reorganization (Structure, Workflow, Skills, Validation, Run)
- Playbook → Studio navigation
- Validation tab (schema, workflow, skills, env checks)
- Run tab (launch with validation gate)
- Run Monitor three-panel layout
- Health diagnostics API + panel
- Electron packaged exe verification
- Craft system docs in `docs/design/craft/`

### Not in Scope

- Workflow persistence across restart (Phase 2)
- Cloud sync
- Multi-user collaboration
- User accounts / auth
- Playbook marketplace
- Full drag-and-drop playbook authoring
- Git integration
- Long-term run history database
- Federation / cross-instance communication

## 7. Testing Strategy

### Backend
- List built-in playbooks returns ≥4
- Category filter works
- Get playbook returns parameters + stages
- Apply `workflow_only` returns non-empty graph
- Apply `create_org` creates valid org
- Fallback graph generation for empty-graph playbooks
- Health details returns expected values

### Frontend
- TypeScript zero errors
- Production build passes (Vite)
- Playbook page loads via `api` client
- Playbook detail opens + shows parameters
- Apply workflow-only loads graph + navigates
- Studio supports `?tab=` query routing
- Validation tab shows pass/warn/error
- Run tab blocks on validation errors

### Electron
- `npm run build` passes
- `electron-builder build --win --dir` creates exe
- Packaged exe launches backend
- Templates API functional in packaged mode
- Health panel shows correct state

## 8. Implementation Phases

| Phase | Work Items | Dependencies |
|---|---|---|
| **P1** | Stabilize build (TS errors, test fixes, CSS module cleanup) | None |
| **P2** | Backend playbook API + built-in graph gen + apply endpoint | P1 |
| **P3** | Frontend Playbook Gallery (library, detail, params, apply) | P2 |
| **P4** | Studio tab restructure (Structure/Workflow/Skills/Validation/Run) | P1 |
| **P5** | Validation tab + Run tab | P4 |
| **P6** | Run Monitor three-panel layout | P4 |
| **P7** | Health diagnostics API + panel | P1 |
| **P8** | Electron rebuild + smoke test | P3, P5, P6, P7 |
| **P9** | Craft system docs | P1 |

## 9. Success Criteria

The redesign is complete when:

1. The app opens on double-click (Electron packaged)
2. Playbook Gallery shows 4+ built-in orchestration playbooks
3. Playbook detail displays pipeline stages + parameter form
4. Graph preview is never blank (generated from stages if empty)
5. Apply playbook enters Studio Workflow tab with graph loaded
6. Studio has 5 distinct tabs matching the authoring flow
7. Validation tab shows pass/warning/error for all checks
8. Run tab launches or explains why it cannot
9. Run Monitor has Timeline, Event Stream, and Gateway panels
10. Health diagnostics reports backend + schema + harness state
11. All error paths visible in UI
12. TypeScript zero errors, backend tests pass, frontend builds
13. No AI-slop visual tells (indigo accent, emoji icons, hero gradients, untracked ALL CAPS)
14. Color discipline enforced (one accent, ≤2 per screen)
