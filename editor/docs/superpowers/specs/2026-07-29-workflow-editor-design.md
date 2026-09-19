# Org Engine Editor — Workflow Editor & UI Modernization Design

> **Date:** 2026-07-29
> **Status:** Draft
> **References:** CrewAI, Ruflo, MAS Factory, AntV X6, shadcn/ui, Open Design

## Overview

Transform Org Engine Editor from a text-based org config manager into a visual workflow orchestration platform. Users can drag-and-drop to design multi-agent workflows, customize from built-in templates, and monitor execution in real-time.

## Architecture

```
frontend/
├── src/
│   ├── components/ui/          # shadcn/ui components (Button, Card, Dialog, etc.)
│   ├── components/workflow/    # AntV X6 workflow canvas components
│   │   ├── WorkflowCanvas.tsx  # Main canvas container
│   │   ├── nodes/             # Custom node definitions
│   │   │   ├── AgentNode.tsx
│   │   │   ├── SkillNode.tsx
│   │   │   ├── DecisionNode.tsx
│   │   │   └── ParallelNode.tsx
│   │   ├── edges/             # Custom edge definitions
│   │   └── Toolbar.tsx        # Canvas toolbar (zoom, fit, undo, redo)
│   ├── components/templates/  # Template browser & editor
│   │   ├── TemplateLibrary.tsx
│   │   └── TemplateEditor.tsx
│   ├── layouts/               # Updated AppShell with responsive sidebar
│   ├── views/                 # All views updated with shadcn/ui
│   └── styles/
│       └── globals.css        # Tailwind + CSS variables theme

backend-server/
├── src/
│   └── templates/             # Template system
│       ├── template-engine.ts  # Template stages/triggers/sinks (cf. OpenDesign)
│       ├── template.routes.ts  # CRUD API
│       └── built-in/          # Pre-built templates
```

## Phase A: Visual Workflow Editor (AntV X6)

### Node Types

| Node | Icon | Properties | Connections |
|------|------|-----------|-------------|
| Agent | 👤 | role, goal, backstory, llm, skills | → Skill, Decision, Parallel |
| Skill | 🔧 | skillId, params, timeout | → Agent, Decision |
| Decision | 🔀 | condition, branches (true/false) | → any |
| Parallel | ⚡ | branches[], mergeStrategy | → any (branch) → join |
| Start | 🟢 | trigger type (manual/schedule/event) | → Agent |
| End | 🔴 | output format | ← any |

### Canvas Features

- **Drag & drop** nodes from toolbar
- **Connection drawing** — click & drag from port to port
- **Auto-layout** — dagre layout algorithm (button in toolbar)
- **Mini-map** — navigation aid
- **Zoom & pan** — scroll wheel, gesture support
- **Selection** — click to select, Shift+click multi-select, box select
- **Undo/Redo** — command history stack
- **Properties panel** — right sidebar that updates based on selected node
- **Validation** — detect disconnected nodes, circular dependencies, missing required fields

### Properties Panel

When selecting a node, right panel shows:
- **Agent Node**: Name, Role, Goal, Backstory, LLM config, Skill list, Environment vars
- **Skill Node**: Skill picker (dropdown from scanned skills), Parameters, Timeout
- **Decision Node**: Condition expression, Branches mapping
- **Parallel Node**: Branch list, Merge strategy (all/any/sequence)

### Data Flow

```
Workflow JSON (stored in org config):
{
  "version": "2.0",
  "nodes": [
    { "id": "n1", "type": "agent", "data": { "role": "researcher", "goal": "..." }, "position": { "x": 100, "y": 200 } },
    { "id": "n2", "type": "skill", "data": { "skillId": "web-search", "params": {} } },
    { "id": "n3", "type": "decision", "data": { "condition": "results.length > 0" } }
  ],
  "edges": [
    { "id": "e1", "source": "n1", "target": "n2" },
    { "id": "e2", "source": "n2", "target": "n3" }
  ],
  "triggers": ["manual"],
  "templates": []
}
```

## Phase C: UI Modernization (shadcn/ui + Tailwind)

### Component Migration

Replace existing CSS Modules with shadcn/ui components:

| Existing | shadcn/ui Replacement |
|----------|----------------------|
| Custom buttons | `<Button>` |
| Org card grid | `<Card>` + `<CardHeader>` + `<CardContent>` |
| Forms (NewOrgForm) | `<Form>` + `<Input>` + `<Select>` + `<Dialog>` |
| RunDialog | `<Dialog>` + `<Sheet>` |
| SchemaViewer | `<Table>` + `<ScrollArea>` |
| Navigation | `<Tabs>` + `<NavigationMenu>` |
| Loading states | `<Skeleton>` |
| Toast/notifications | `<Toast>` |

### Theme System

- CSS variables for colors (HSL format, compatible with shadcn/ui)
- Dark/light mode toggle via `next-themes` pattern
- CSS class strategy: `.dark` class on `<html>` element
- Persist preference to localStorage

### Responsive Layout

- AppShell with collapsible sidebar (mobile: drawer)
- Main content area: min-width 320px, max-width 1440px
- Workflow canvas: 100% width, min-height 600px

## Template System (参考 OpenDesign)

### Template Definition

```typescript
interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  category: 'scaffold' | 'audit' | 'deploy' | 'custom';
  triggers: TriggerKind[];
  stages: StageDef[];
  nodes: NodeDefinition[];  // pre-configured node layout
  edges: EdgeDefinition[];
  outputSinks: ('org' | 'run' | 'export')[];
  tags: string[];
}
```

### Built-in Templates

1. **Org Scaffold** — Create new org with departments, roles, budget in sequence
2. **Audit Run** — Validate org → Run skills → Generate report → Review
3. **Deploy Pipeline** — Export YAML → Validate → Deploy → Verify
4. **Research Flow** — Parallel researchers → Synthesizer → Editor (CrewAI pattern)
5. **Custom (blank)** — Empty canvas for user to design from scratch

### User Custom Templates

- Save any workflow as a template
- Share templates via JSON export/import
- Template marketplace via plugin registry (cf. OpenDesign's `open-design.json`)

## Implementation Order

### Sprint 1: Foundation (Phase A core)
1. Install shadcn/ui + Tailwind + AntV X6 dependencies
2. Create base shadcn/ui components (Button, Card, Dialog, etc.)
3. Implement WorkflowCanvas with AntV X6
4. Create custom node types (Agent, Skill, Decision, Parallel)

### Sprint 2: Editor Features (Phase A complete)
5. Properties panel (right sidebar with node editing)
6. Toolbar (zoom, fit, undo, redo, layout, save)
7. Validation and error display
8. Save/load workflow JSON

### Sprint 3: Templates + UI (Phase C + templates)
9. Template engine backend
10. Template library UI
11. Dark/light theme
12. Responsive layout fixes
13. Migrate all existing views to shadcn/ui

### Sprint 4: Polish
14. E2E tests for workflow editor
15. Performance optimization for large workflows
16. Template marketplace foundation
