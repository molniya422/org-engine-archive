# Visual Workflow Editor & UI Modernization Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform Org Engine Editor with a visual DAG workflow editor (AntV X6), modern UI (shadcn/ui + Tailwind CSS), and template system (参考 OpenDesign).

**Architecture:** Frontend React + Vite, backend Fastify + SQLite. Workflow editor uses @xyflow/react (React Flow) on top of AntV X6 layout engine. UI uses shadcn/ui components with Tailwind CSS. Template engine references OpenDesign's AutomationTemplate pattern.

**Tech Stack:** @xyflow/react (React Flow), AntV X6 (layout), shadcn/ui + Radix UI, Tailwind CSS, class-variance-authority, tailwind-merge, lucide-react

---

## File Structure

```
frontend/src/
├── components/
│   ├── ui/                    # [NEW] shadcn/ui components
│   │   ├── button.tsx
│   │   ├── card.tsx
│   │   ├── dialog.tsx
│   │   ├── form.tsx
│   │   ├── input.tsx
│   │   ├── select.tsx
│   │   ├── table.tsx
│   │   ├── tabs.tsx
│   │   ├── badge.tsx
│   │   ├── skeleton.tsx
│   │   ├── scroll-area.tsx
│   │   ├── sheet.tsx
│   │   ├── dropdown-menu.tsx
│   │   └── separator.tsx
│   └── workflow/              # [NEW] workflow editor
│       ├── WorkflowCanvas.tsx
│       ├── WorkflowToolbar.tsx
│       ├── PropertiesPanel.tsx
│       ├── nodes/
│       │   ├── AgentNode.tsx
│       │   ├── SkillNode.tsx
│       │   ├── DecisionNode.tsx
│       │   └── ParallelNode.tsx
│       └── types.ts
├── layouts/
│   └── AppShell.tsx           # [MODIFY] responsive sidebar
├── views/
│   ├── HomeView.tsx           # [MODIFY] use shadcn/ui
│   ├── StudioView.tsx         # [MODIFY] add workflow tab
│   ├── SkillsView.tsx         # [MODIFY] use shadcn/ui
│   └── RunMonitorView.tsx     # [MODIFY] use shadcn/ui
├── stores/
│   └── workflow-store.ts      # [NEW] workflow state
├── styles/
│   ├── globals.css            # [NEW] Tailwind + CSS variables
│   └── tailwind.css           # [NEW] tailwind directives
├── tailwind.config.ts         # [NEW]
└── postcss.config.js          # [NEW] (if not exists)

frontend/e2e/
└── workflow.spec.ts           # [NEW] workflow editor E2E tests

backend-server/src/
└── templates/                 # [NEW] template system
    ├── template-engine.ts
    ├── template.routes.ts
    ├── built-in/
    │   ├── org-scaffold.ts
    │   ├── audit-run.ts
    │   ├── deploy-pipeline.ts
    │   └── research-flow.ts
    └── index.ts
```

---

### Task 1: Install Dependencies

**Files:**
- Modify: `frontend/package.json`
- Create: `frontend/tailwind.config.ts`
- Create: `frontend/postcss.config.js`
- Create: `frontend/src/styles/globals.css`

**Overview:** Install Tailwind CSS, shadcn/ui base, AntV X6, @xyflow/react, and all supporting libraries. Set up PostCSS and Tailwind config.

- [ ] **Step 1: Install Tailwind CSS and PostCSS**

```bash
cd frontend
npm install -D tailwindcss @tailwindcss/postcss postcss
npx tailwindcss init -p
```

- [ ] **Step 2: Install shadcn/ui and required packages**

```bash
cd frontend
npm install class-variance-authority clsx tailwind-merge lucide-react
npm install @radix-ui/react-dialog @radix-ui/react-dropdown-menu @radix-ui/react-select
npm install @radix-ui/react-tabs @radix-ui/react-scroll-area @radix-ui/react-slot
npm install @radix-ui/react-separator @radix-ui/react-label @radix-ui/react-skeleton
npm install tailwindcss-animate
```

- [ ] **Step 3: Install AntV X6 and React Flow**

```bash
cd frontend
npm install @xyflow/react @antv/x6 @antv/x6-react-shape
npm install -D @types/dagre
```

- [ ] **Step 4: Create tailwind.config.ts**

```typescript
// frontend/tailwind.config.ts
import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: { DEFAULT: 'hsl(var(--primary))', foreground: 'hsl(var(--primary-foreground))' },
        secondary: { DEFAULT: 'hsl(var(--secondary))', foreground: 'hsl(var(--secondary-foreground))' },
        destructive: { DEFAULT: 'hsl(var(--destructive))', foreground: 'hsl(var(--destructive-foreground))' },
        muted: { DEFAULT: 'hsl(var(--muted))', foreground: 'hsl(var(--muted-foreground))' },
        accent: { DEFAULT: 'hsl(var(--accent))', foreground: 'hsl(var(--accent-foreground))' },
        popover: { DEFAULT: 'hsl(var(--popover))', foreground: 'hsl(var(--popover-foreground))' },
        card: { DEFAULT: 'hsl(var(--card))', foreground: 'hsl(var(--card-foreground))' },
      },
      borderRadius: { lg: 'var(--radius)', md: 'calc(var(--radius) - 2px)', sm: 'calc(var(--radius) - 4px)' },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

export default config;
```

- [ ] **Step 5: Create globals.css with CSS variables for theme**

```css
/* frontend/src/styles/globals.css */
@import "tailwindcss";

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 222.2 84% 4.9%;
    --card: 0 0% 100%;
    --card-foreground: 222.2 84% 4.9%;
    --popover: 0 0% 100%;
    --popover-foreground: 222.2 84% 4.9%;
    --primary: 222.2 47.4% 11.2%;
    --primary-foreground: 210 40% 98%;
    --secondary: 210 40% 96.1%;
    --secondary-foreground: 222.2 47.4% 11.2%;
    --muted: 210 40% 96.1%;
    --muted-foreground: 215.4 16.3% 46.9%;
    --accent: 210 40% 96.1%;
    --accent-foreground: 222.2 47.4% 11.2%;
    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 210 40% 98%;
    --border: 214.3 31.8% 91.4%;
    --input: 214.3 31.8% 91.4%;
    --ring: 222.2 84% 4.9%;
    --radius: 0.5rem;
  }

  .dark {
    --background: 222.2 84% 4.9%;
    --foreground: 210 40% 98%;
    --card: 222.2 84% 4.9%;
    --card-foreground: 210 40% 98%;
    --popover: 222.2 84% 4.9%;
    --popover-foreground: 210 40% 98%;
    --primary: 210 40% 98%;
    --primary-foreground: 222.2 47.4% 11.2%;
    --secondary: 217.2 32.6% 17.5%;
    --secondary-foreground: 210 40% 98%;
    --muted: 217.2 32.6% 17.5%;
    --muted-foreground: 215 20.2% 65.1%;
    --accent: 217.2 32.6% 17.5%;
    --accent-foreground: 210 40% 98%;
    --destructive: 0 62.8% 30.6%;
    --destructive-foreground: 210 40% 98%;
    --border: 217.2 32.6% 17.5%;
    --input: 217.2 32.6% 17.5%;
    --ring: 212.7 26.8% 83.9%;
  }
}
```

- [ ] **Step 6: Update main.tsx to import globals.css**

```typescript
// frontend/src/main.tsx — add import
import './styles/globals.css';
```

- [ ] **Step 7: Run existing tests to verify nothing broke**

Run: `cd frontend && npx vitest run`
Expected: All existing tests pass

- [ ] **Step 8: Commit**

```bash
git add frontend/package.json frontend/tailwind.config.ts frontend/postcss.config.js frontend/src/styles/globals.css frontend/src/main.tsx
git commit -m "chore: install tailwind, shadcn/ui, antv x6 dependencies"
```

---

### Task 2: Create shadcn/ui Component Library

**Files:**
- Create: `frontend/src/lib/utils.ts`
- Create: `frontend/src/components/ui/button.tsx`
- Create: `frontend/src/components/ui/card.tsx`
- Create: `frontend/src/components/ui/dialog.tsx`
- Create: `frontend/src/components/ui/input.tsx`
- Create: `frontend/src/components/ui/select.tsx`
- Create: `frontend/src/components/ui/tabs.tsx`
- Create: `frontend/src/components/ui/badge.tsx`
- Create: `frontend/src/components/ui/skeleton.tsx`
- Create: `frontend/src/components/ui/scroll-area.tsx`
- Create: `frontend/src/components/ui/separator.tsx`
- Create: `frontend/src/components/ui/dropdown-menu.tsx`
- Create: `frontend/src/components/ui/sheet.tsx`
- Create: `frontend/src/components/ui/form.tsx`

**Overview:** Create the base shadcn/ui component library that all views will use.

- [ ] **Step 1: Create utils.ts for cn() helper**

```typescript
// frontend/src/lib/utils.ts
import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 2: Create shadcn/ui components**

Copy the standard shadcn/ui component implementations for each component (Button, Card, Dialog, Input, Select, Tabs, Badge, Skeleton, ScrollArea, Separator, DropdownMenu, Sheet). Each should:
- Use `cn()` for className merging
- Use Radix UI primitives where needed
- Use `cva()` from class-variance-authority for variants
- Export as named exports

Example for Button:
```typescript
// frontend/src/components/ui/button.tsx
import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 rounded-md px-3',
        lg: 'h-11 rounded-md px-8',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
```

Create similar standard implementations for all other shadcn/ui components listed above.

- [ ] **Step 3: Verify components compile**

Run: `cd frontend && npx tsc --noEmit`
Expected: TypeScript compiles without errors

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/utils.ts frontend/src/components/ui/
git commit -m "feat: add shadcn/ui component library"
```

---

### Task 3: Implement Workflow Canvas (AntV X6 + React Flow)

**Files:**
- Create: `frontend/src/components/workflow/types.ts`
- Create: `frontend/src/components/workflow/nodes/AgentNode.tsx`
- Create: `frontend/src/components/workflow/nodes/SkillNode.tsx`
- Create: `frontend/src/components/workflow/nodes/DecisionNode.tsx`
- Create: `frontend/src/components/workflow/nodes/ParallelNode.tsx`
- Create: `frontend/src/components/workflow/WorkflowCanvas.tsx`
- Create: `frontend/src/components/workflow/WorkflowToolbar.tsx`
- Create: `frontend/src/components/workflow/PropertiesPanel.tsx`
- Create: `frontend/src/stores/workflow-store.ts`

**Overview:** Build the visual DAG workflow editor using @xyflow/react (React Flow) with custom node types. Include drag-and-drop from toolbar, connection drawing, node selection.

- [ ] **Step 1: Define workflow types**

```typescript
// frontend/src/components/workflow/types.ts
import type { Node, Edge } from '@xyflow/react';

export type WorkflowNodeType = 'agent' | 'skill' | 'decision' | 'parallel' | 'start' | 'end';

export interface AgentNodeData {
  type: 'agent';
  role: string;
  goal: string;
  backstory: string;
  llm: string;
  skills: string[];
}

export interface SkillNodeData {
  type: 'skill';
  skillId: string;
  params: Record<string, unknown>;
  timeout: number;
}

export interface DecisionNodeData {
  type: 'decision';
  condition: string;
  branches: Record<string, string>;
}

export interface ParallelNodeData {
  type: 'parallel';
  branches: string[];
  mergeStrategy: 'all' | 'any' | 'sequence';
}

export type WorkflowNodeData = AgentNodeData | SkillNodeData | DecisionNodeData | ParallelNodeData;

export type WorkflowNode = Node<WorkflowNodeData>;
export type WorkflowEdge = Edge;

export interface WorkflowDefinition {
  version: '2.0';
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  triggers: string[];
}

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  category: 'scaffold' | 'audit' | 'deploy' | 'research' | 'custom';
  triggers: string[];
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}
```

- [ ] **Step 2: Create AgentNode component**

```typescript
// frontend/src/components/workflow/nodes/AgentNode.tsx
import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { AgentNodeData } from '../types';

function AgentNode({ data, selected }: NodeProps<AgentNodeData>) {
  return (
    <div className={`px-4 py-3 rounded-lg border-2 shadow-sm bg-white dark:bg-gray-800 min-w-[180px] ${selected ? 'border-blue-500' : 'border-gray-200 dark:border-gray-700'}`}>
      <Handle type="target" position={Position.Top} />
      <div className="flex items-center gap-2 mb-2">
        <span className="text-lg">👤</span>
        <span className="font-semibold text-sm">{data.role || 'Agent'}</span>
      </div>
      <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{data.goal?.slice(0, 60)}</div>
      <div className="flex gap-1 mt-2 flex-wrap">
        {data.skills?.slice(0, 3).map(s => (
          <span key={s} className="px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded text-[10px]">{s}</span>
        ))}
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

export default memo(AgentNode);
```

- [ ] **Step 3: Create SkillNode component**

```typescript
// frontend/src/components/workflow/nodes/SkillNode.tsx
import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { SkillNodeData } from '../types';

function SkillNode({ data, selected }: NodeProps<SkillNodeData>) {
  return (
    <div className={`px-4 py-3 rounded-lg border-2 shadow-sm bg-white dark:bg-gray-800 min-w-[160px] ${selected ? 'border-green-500' : 'border-gray-200 dark:border-gray-700'}`}>
      <Handle type="target" position={Position.Top} />
      <div className="flex items-center gap-2 mb-2">
        <span className="text-lg">🔧</span>
        <span className="font-semibold text-sm">{data.skillId || 'Skill'}</span>
      </div>
      <div className="text-xs text-gray-500 dark:text-gray-400">{data.timeout ? `timeout: ${data.timeout}s` : ''}</div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

export default memo(SkillNode);
```

- [ ] **Step 4: Create DecisionNode component**

```typescript
// frontend/src/components/workflow/nodes/DecisionNode.tsx
import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { DecisionNodeData } from '../types';

function DecisionNode({ data, selected }: NodeProps<DecisionNodeData>) {
  return (
    <div className={`px-4 py-3 rounded-lg border-2 shadow-sm bg-white dark:bg-gray-800 min-w-[160px] ${selected ? 'border-amber-500' : 'border-gray-200 dark:border-gray-700'}`}>
      <Handle type="target" position={Position.Top} />
      <div className="flex items-center gap-2 mb-2">
        <span className="text-lg">🔀</span>
        <span className="font-semibold text-sm">Decision</span>
      </div>
      <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{data.condition || 'condition'}</div>
      <Handle type="source" position={Position.Bottom} id="true" />
      <Handle type="source" position={Position.Right} id="false" style={{ background: '#ef4444' }} />
    </div>
  );
}

export default memo(DecisionNode);
```

- [ ] **Step 5: Create ParallelNode component**

```typescript
// frontend/src/components/workflow/nodes/ParallelNode.tsx
import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { ParallelNodeData } from '../types';

function ParallelNode({ data, selected }: NodeProps<ParallelNodeData>) {
  return (
    <div className={`px-4 py-3 rounded-lg border-2 shadow-sm bg-white dark:bg-gray-800 min-w-[160px] ${selected ? 'border-purple-500' : 'border-gray-200 dark:border-gray-700'}`}>
      <Handle type="target" position={Position.Top} />
      <div className="flex items-center gap-2 mb-2">
        <span className="text-lg">⚡</span>
        <span className="font-semibold text-sm">Parallel</span>
      </div>
      <div className="text-xs text-gray-500 dark:text-gray-400">{data.branches?.length || 0} branches · {data.mergeStrategy}</div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

export default memo(ParallelNode);
```

- [ ] **Step 6: Create workflow store (Zustand)**

```typescript
// frontend/src/stores/workflow-store.ts
import { create } from 'zustand';
import {
  type Node,
  type Edge,
  type Connection,
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  type NodeChange,
  type EdgeChange,
} from '@xyflow/react';
import type { WorkflowNodeData } from '@/components/workflow/types';

interface WorkflowState {
  nodes: Node<WorkflowNodeData>[];
  edges: Edge[];
  selectedNode: Node<WorkflowNodeData> | null;
  templateId: string | null;
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (connection: Connection) => void;
  addNode: (type: string, position: { x: number; y: number }) => void;
  setSelectedNode: (node: Node<WorkflowNodeData> | null) => void;
  updateNodeData: (nodeId: string, data: Partial<WorkflowNodeData>) => void;
  loadWorkflow: (nodes: Node<WorkflowNodeData>[], edges: Edge[]) => void;
  clearWorkflow: () => void;
  undo: () => void;
  redo: () => void;
}

export const useWorkflowStore = create<WorkflowState>((set, get) => ({
  nodes: [],
  edges: [],
  selectedNode: null,
  templateId: null,

  onNodesChange: (changes) => set({ nodes: applyNodeChanges(changes, get().nodes) }),

  onEdgesChange: (changes) => set({ edges: applyEdgeChanges(changes, get().edges) }),

  onConnect: (connection) => set({ edges: addEdge(connection, get().edges) }),

  addNode: (type, position) => {
    const id = `node_${Date.now()}`;
    const baseData = (() => {
      switch (type) {
        case 'agent': return { type: 'agent', role: 'New Agent', goal: '', backstory: '', llm: 'default', skills: [] };
        case 'skill': return { type: 'skill', skillId: '', params: {}, timeout: 60 };
        case 'decision': return { type: 'decision', condition: '', branches: {} };
        case 'parallel': return { type: 'parallel', branches: [], mergeStrategy: 'all' as const };
        case 'start': return { type: 'start' as const };
        case 'end': return { type: 'end' as const };
        default: return { type: 'agent', role: '', goal: '', backstory: '', llm: '', skills: [] };
      }
    })();
    const newNode: Node = { id, type, position, data: baseData };
    set({ nodes: [...get().nodes, newNode] });
  },

  setSelectedNode: (node) => set({ selectedNode: node }),

  updateNodeData: (nodeId, data) => set({
    nodes: get().nodes.map(n => n.id === nodeId ? { ...n, data: { ...n.data, ...data } } : n),
  }),

  loadWorkflow: (nodes, edges) => set({ nodes, edges, selectedNode: null }),

  clearWorkflow: () => set({ nodes: [], edges: [], selectedNode: null }),

  undo: () => {},
  redo: () => {},
}));
```

- [ ] **Step 7: Create WorkflowCanvas component**

```typescript
// frontend/src/components/workflow/WorkflowCanvas.tsx
import { useCallback, useRef, DragEvent } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  BackgroundVariant,
  type Node,
  type NodeTypes,
  type OnDrop,
  type OnDragOver,
  ReactFlowProvider,
  useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import AgentNode from './nodes/AgentNode';
import SkillNode from './nodes/SkillNode';
import DecisionNode from './nodes/DecisionNode';
import ParallelNode from './nodes/ParallelNode';
import { useWorkflowStore } from '@/stores/workflow-store';
import type { WorkflowNodeData } from './types';

const nodeTypes: NodeTypes = {
  agent: AgentNode,
  skill: SkillNode,
  decision: DecisionNode,
  parallel: ParallelNode,
};

interface WorkflowCanvasProps {
  onNodeClick?: (node: Node<WorkflowNodeData>) => void;
  readOnly?: boolean;
}

function CanvasInner({ onNodeClick, readOnly }: WorkflowCanvasProps) {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition } = useReactFlow();
  const { nodes, edges, onNodesChange, onEdgesChange, onConnect, addNode } = useWorkflowStore();

  const onDrop: OnDrop = useCallback((event: DragEvent) => {
    event.preventDefault();
    const type = event.dataTransfer.getData('application/reactflow');
    if (!type || !reactFlowWrapper.current) return;
    const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
    addNode(type, position);
  }, [screenToFlowPosition, addNode]);

  const onDragOver: OnDragOver = useCallback((event: DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  return (
    <div ref={reactFlowWrapper} className="w-full h-full min-h-[600px]">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onNodeClick={(_, node) => onNodeClick?.(node as Node<WorkflowNodeData>)}
        nodeTypes={nodeTypes}
        fitView
        deleteKeyCode={readOnly ? undefined : 'Backspace'}
        snapToGrid
        snapGrid={[20, 20]}
        nodesDraggable={!readOnly}
        nodesConnectable={!readOnly}
        elementsSelectable
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
        <Controls />
        <MiniMap
          nodeStrokeWidth={3}
          pannable
          zoomable
          className="!bottom-4 !left-4 !shadow-lg !rounded-lg !border !border-gray-200 dark:!border-gray-700"
        />
      </ReactFlow>
    </div>
  );
}

export function WorkflowCanvas(props: WorkflowCanvasProps) {
  return (
    <ReactFlowProvider>
      <CanvasInner {...props} />
    </ReactFlowProvider>
  );
}
```

- [ ] **Step 8: Create WorkflowToolbar component**

```typescript
// frontend/src/components/workflow/WorkflowToolbar.tsx
import { useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { useWorkflowStore } from '@/stores/workflow-store';

const nodeTypes = [
  { type: 'agent', label: 'Agent', icon: '👤' },
  { type: 'skill', label: 'Skill', icon: '🔧' },
  { type: 'decision', label: 'Decision', icon: '🔀' },
  { type: 'parallel', label: 'Parallel', icon: '⚡' },
];

export function WorkflowToolbar() {
  const { clearWorkflow } = useWorkflowStore();

  const onDragStart = useCallback((event: React.DragEvent, nodeType: string) => {
    event.dataTransfer.setData('application/reactflow', nodeType);
    event.dataTransfer.effectAllowed = 'move';
  }, []);

  return (
    <div className="flex items-center gap-2 p-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
      <div className="flex items-center gap-1.5 mr-4">
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400 mr-2">Nodes</span>
        {nodeTypes.map(nt => (
          <div
            key={nt.type}
            draggable
            onDragStart={(e) => onDragStart(e, nt.type)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 cursor-grab active:cursor-grabbing hover:bg-gray-100 dark:hover:bg-gray-700 text-xs"
          >
            <span>{nt.icon}</span>
            <span>{nt.label}</span>
          </div>
        ))}
      </div>
      <div className="flex-1" />
      <Button variant="outline" size="sm" onClick={clearWorkflow}>Clear</Button>
      <Button variant="default" size="sm">Save</Button>
    </div>
  );
}
```

- [ ] **Step 9: Create PropertiesPanel component**

```typescript
// frontend/src/components/workflow/PropertiesPanel.tsx
import { useWorkflowStore } from '@/stores/workflow-store';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export function PropertiesPanel() {
  const { selectedNode, updateNodeData, setSelectedNode } = useWorkflowStore();

  if (!selectedNode) {
    return (
      <div className="p-4 text-sm text-gray-400 dark:text-gray-500 text-center">
        Select a node to edit properties
      </div>
    );
  }

  const data = selectedNode.data as any;

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm">Properties</h3>
        <Button variant="ghost" size="sm" onClick={() => setSelectedNode(null)}>✕</Button>
      </div>
      <div>
        <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Type</label>
        <Badge variant="outline" className="mt-1 capitalize">{data.type}</Badge>
      </div>
      {data.type === 'agent' && (
        <>
          <div>
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Role</label>
            <Input value={data.role} onChange={e => updateNodeData(selectedNode.id, { role: e.target.value })} />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Goal</label>
            <textarea className="w-full min-h-[60px] rounded-md border border-input bg-background px-3 py-2 text-sm" value={data.goal} onChange={e => updateNodeData(selectedNode.id, { goal: e.target.value })} />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400">LLM</label>
            <Input value={data.llm} onChange={e => updateNodeData(selectedNode.id, { llm: e.target.value })} />
          </div>
        </>
      )}
      {data.type === 'skill' && (
        <>
          <div>
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Skill ID</label>
            <Input value={data.skillId} onChange={e => updateNodeData(selectedNode.id, { skillId: e.target.value })} />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Timeout (s)</label>
            <Input type="number" value={data.timeout} onChange={e => updateNodeData(selectedNode.id, { timeout: parseInt(e.target.value) || 60 })} />
          </div>
        </>
      )}
      {data.type === 'decision' && (
        <div>
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Condition</label>
          <Input value={data.condition} onChange={e => updateNodeData(selectedNode.id, { condition: e.target.value })} />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 10: Verify TypeScript compilation**

Run: `cd frontend && npx tsc --noEmit`
Expected: Compiles without errors

- [ ] **Step 11: Commit**

```bash
git add frontend/src/components/workflow/ frontend/src/stores/workflow-store.ts
git commit -m "feat: implement workflow canvas with react-flow custom nodes"
```

---

### Task 4: Integrate Workflow Canvas into StudioView

**Files:**
- Modify: `frontend/src/views/StudioView.tsx`
- Modify: `frontend/src/router.tsx`

**Overview:** Add workflow editor as a new tab in StudioView alongside the existing tree and canvas views.

- [ ] **Step 1: Update StudioView to add workflow tab**

Modify StudioView to include a new "Workflow" tab that shows the WorkflowCanvas, WorkflowToolbar, and PropertiesPanel in a three-panel layout:

```
┌──────────────────────────────────────────────┐
│ Toolbar (tabs: Tree | Canvas | Workflow)      │
├──────────────────────┬───────────────────────┤
│                      │                       │
│  WorkflowCanvas      │  PropertiesPanel      │
│  (main area)         │  (right sidebar,      │
│                      │   320px, collapsible) │
│                      │                       │
└──────────────────────┴───────────────────────┘
```

Key code additions to StudioView.tsx:
```typescript
// Add import
import { WorkflowCanvas } from '@/components/workflow/WorkflowCanvas';
import { WorkflowToolbar } from '@/components/workflow/WorkflowToolbar';
import { PropertiesPanel } from '@/components/workflow/PropertiesPanel';
import { useWorkflowStore } from '@/stores/workflow-store';

// Add tab option
const editorTabs = ['tree', 'canvas', 'workflow'] as const;

// Add workflow tab rendering
{editorTab === 'workflow' && (
  <div className="flex h-full" style={{ height: 'calc(100vh - 120px)' }}>
    <div className="flex-1 flex flex-col">
      <WorkflowToolbar />
      <div className="flex-1">
        <WorkflowCanvas onNodeClick={(node) => workflowStore.setSelectedNode(node)} />
      </div>
    </div>
    <div className="w-80 border-l border-gray-200 dark:border-gray-700 overflow-y-auto">
      <PropertiesPanel />
    </div>
  </div>
)}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/views/StudioView.tsx
git commit -m "feat: integrate workflow canvas into studio view"
```

---

### Task 5: Backend Template Engine

**Files:**
- Create: `backend-server/src/templates/index.ts`
- Create: `backend-server/src/templates/template-engine.ts`
- Create: `backend-server/src/templates/template.routes.ts`
- Create: `backend-server/src/templates/built-in/org-scaffold.ts`
- Create: `backend-server/src/templates/built-in/audit-run.ts`
- Create: `backend-server/src/templates/built-in/deploy-pipeline.ts`
- Create: `backend-server/src/templates/built-in/research-flow.ts`
- Modify: `backend-server/src/server.ts`

**Overview:** Create the template system on the backend, referencing OpenDesign's AutomationTemplate pattern. Templates define stages, triggers, sources, and output sinks.

- [ ] **Step 1: Define template engine types**

```typescript
// backend-server/src/templates/template-engine.ts

export type TriggerKind = 'manual' | 'schedule' | 'event';
export type SourceKind = 'org' | 'run' | 'upload' | 'url';
export type StageKind = 'validate' | 'transform' | 'execute' | 'review' | 'export';
export type OutputSink = 'org' | 'run' | 'export' | 'memory';

export interface TemplateStage {
  id: string;
  kind: StageKind;
  title: string;
  config?: Record<string, unknown>;
}

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  category: 'scaffold' | 'audit' | 'deploy' | 'research' | 'custom';
  triggerKinds: TriggerKind[];
  sourceKinds: SourceKind[];
  stages: TemplateStage[];
  outputSinks: OutputSink[];
  tags: string[];
  template: {
    nodes: unknown[];
    edges: unknown[];
  };
  builtIn: boolean;
}

// In-memory template registry
const templates = new Map<string, WorkflowTemplate>();

export function registerTemplate(t: WorkflowTemplate): void {
  templates.set(t.id, t);
}

export function listTemplates(category?: string): WorkflowTemplate[] {
  const all = Array.from(templates.values());
  return category ? all.filter(t => t.category === category) : all;
}

export function getTemplate(id: string): WorkflowTemplate | undefined {
  return templates.get(id);
}

export function deleteTemplate(id: string): boolean {
  return templates.delete(id);
}

export function createUserTemplate(base: WorkflowTemplate): WorkflowTemplate {
  const userTemplate: WorkflowTemplate = {
    ...base,
    id: `user_${Date.now()}`,
    builtIn: false,
    category: 'custom',
  };
  registerTemplate(userTemplate);
  return userTemplate;
}
```

- [ ] **Step 2: Create built-in templates**

```typescript
// backend-server/src/templates/built-in/org-scaffold.ts
import { registerTemplate } from '../template-engine';

registerTemplate({
  id: 'org-scaffold',
  name: 'Org Scaffold',
  description: 'Create a new organization with departments, roles, and budget in sequence',
  category: 'scaffold',
  triggerKinds: ['manual'],
  sourceKinds: ['org'],
  stages: [
    { id: 's1', kind: 'validate', title: 'Validate org config' },
    { id: 's2', kind: 'transform', title: 'Apply role templates' },
    { id: 's3', kind: 'review', title: 'Review generated structure' },
    { id: 's4', kind: 'export', title: 'Export final config' },
  ],
  outputSinks: ['org', 'export'],
  tags: ['scaffold', 'org'],
  template: { nodes: [], edges: [] },
  builtIn: true,
});
```

Similarly create audit-run.ts, deploy-pipeline.ts, and research-flow.ts built-in templates.

- [ ] **Step 3: Create template routes**

```typescript
// backend-server/src/templates/template.routes.ts
import type { FastifyInstance } from 'fastify';
import { listTemplates, getTemplate, createUserTemplate, deleteTemplate } from './template-engine';

export function registerTemplateRoutes(app: FastifyInstance): void {
  app.get('/api/v1/templates', async (req) => {
    const { category } = req.query as { category?: string };
    return listTemplates(category);
  });

  app.get('/api/v1/templates/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const t = getTemplate(id);
    if (!t) return reply.status(404).send({ error: 'Template not found' });
    return t;
  });

  app.post('/api/v1/templates', async (req) => {
    const body = req.body as any;
    return createUserTemplate(body);
  });

  app.delete('/api/v1/templates/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!deleteTemplate(id)) return reply.status(404).send({ error: 'Template not found' });
    return { success: true };
  });
}
```

- [ ] **Step 4: Create templates barrel export**

```typescript
// backend-server/src/templates/index.ts
export { registerTemplate, listTemplates, getTemplate, createUserTemplate } from './template-engine';
export { registerTemplateRoutes } from './template.routes';
// Import built-in templates to register them
import './built-in/org-scaffold';
import './built-in/audit-run';
import './built-in/deploy-pipeline';
import './built-in/research-flow';
```

- [ ] **Step 5: Register template routes in server.ts**

Add to `backend-server/src/server.ts`:
```typescript
import { registerTemplateRoutes } from './templates/index.js';

// In startServer(), add:
registerTemplateRoutes(app);
```

- [ ] **Step 6: Run backend tests**

Run: `cd backend-server && npm test`
Expected: All existing tests pass

- [ ] **Step 7: Commit**

```bash
git add backend-server/src/templates/ backend-server/src/server.ts
git commit -m "feat: add template engine with built-in workflow templates"
```

---

### Task 6: Template Library UI

**Files:**
- Create: `frontend/src/components/templates/TemplateLibrary.tsx`
- Create: `frontend/src/components/templates/TemplateCard.tsx`
- Create: `frontend/src/components/templates/TemplateEditor.tsx`
- Modify: `frontend/src/views/HomeView.tsx`
- Modify: `frontend/src/router.tsx`

**Overview:** Create template library browsing UI with template cards, apply template to workflow, and save custom templates.

- [ ] **Step 1: Create TemplateCard and TemplateLibrary components**

```typescript
// frontend/src/components/templates/TemplateCard.tsx
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface TemplateCardProps {
  template: {
    id: string;
    name: string;
    description: string;
    category: string;
    tags: string[];
    builtIn: boolean;
  };
  onApply: (id: string) => void;
}

export function TemplateCard({ template, onApply }: TemplateCardProps) {
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          {template.name}
          {template.builtIn && <Badge variant="secondary" className="text-[10px]">built-in</Badge>}
        </CardTitle>
        <CardDescription className="text-xs">{template.description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex gap-1 flex-wrap">
          {template.tags.map(tag => (
            <Badge key={tag} variant="outline" className="text-[10px]">{tag}</Badge>
          ))}
        </div>
      </CardContent>
      <CardFooter>
        <Button size="sm" onClick={() => onApply(template.id)} className="w-full">Apply Template</Button>
      </CardFooter>
    </Card>
  );
}
```

```typescript
// frontend/src/components/templates/TemplateLibrary.tsx
import { useEffect, useState } from 'react';
import { TemplateCard } from './TemplateCard';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';

interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  builtIn: boolean;
}

const categories = [
  { value: 'all', label: 'All' },
  { value: 'scaffold', label: 'Scaffold' },
  { value: 'audit', label: 'Audit' },
  { value: 'deploy', label: 'Deploy' },
  { value: 'research', label: 'Research' },
];

export function TemplateLibrary() {
  const [templates, setTemplates] = useState<WorkflowTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState('all');

  useEffect(() => {
    const params = activeCategory !== 'all' ? `?category=${activeCategory}` : '';
    fetch(`/api/v1/templates${params}`)
      .then(r => r.json())
      .then(data => { setTemplates(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [activeCategory]);

  const handleApply = async (id: string) => {
    const res = await fetch(`/api/v1/templates/${id}`);
    const t = await res.json();
    if (t.template) {
      // Dispatch to workflow store
      const { useWorkflowStore } = await import('@/stores/workflow-store');
      useWorkflowStore.getState().loadWorkflow(t.template.nodes, t.template.edges);
    }
  };

  if (loading) return <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">{[1,2,3].map(i => <Skeleton key={i} className="h-40" />)}</div>;

  return (
    <div className="p-4">
      <Tabs value={activeCategory} onValueChange={setActiveCategory}>
        <TabsList>
          {categories.map(c => <TabsTrigger key={c.value} value={c.value}>{c.label}</TabsTrigger>)}
        </TabsList>
        <TabsContent value={activeCategory} className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {templates.map(t => <TemplateCard key={t.id} template={t} onApply={handleApply} />)}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
```

- [ ] **Step 2: Add templates route to router**

```typescript
// In frontend/src/router.tsx, add a templates route
{ path: 'templates', element: <TemplateLibrary /> }
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/templates/ frontend/src/router.tsx
git commit -m "feat: add template library UI with category filtering"
```

---

### Task 7: Dark/Light Theme & Responsive Layout

**Files:**
- Modify: `frontend/src/layouts/AppShell.tsx`
- Modify: `frontend/src/layouts/AppShell.module.css`
- Create: `frontend/src/stores/theme-store.ts`
- Modify: `frontend/src/components/workflow/WorkflowCanvas.tsx`

**Overview:** Add dark/light theme toggle with CSS class strategy, responsive sidebar, and theme persistence.

- [ ] **Step 1: Create theme store**

```typescript
// frontend/src/stores/theme-store.ts
import { create } from 'zustand';

type Theme = 'light' | 'dark';

interface ThemeState {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
}

export const useThemeStore = create<ThemeState>((set) => ({
  theme: (typeof window !== 'undefined' && localStorage.getItem('theme') as Theme) || 'light',
  toggleTheme: () => set(state => {
    const next = state.theme === 'light' ? 'dark' : 'light';
    localStorage.setItem('theme', next);
    document.documentElement.classList.toggle('dark', next === 'dark');
    return { theme: next };
  }),
  setTheme: (theme) => {
    localStorage.setItem('theme', theme);
    document.documentElement.classList.toggle('dark', theme === 'dark');
    set({ theme });
  },
}));
```

- [ ] **Step 2: Update AppShell with theme toggle and responsive sidebar**

Modify AppShell.tsx to add:
- Theme toggle button in sidebar footer
- Collapsible sidebar on mobile (using a drawer/sheet)
- Updated nav links with shadcn/ui styling

```typescript
// Key additions to AppShell.tsx:
import { useThemeStore } from '@/stores/theme-store';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

// In the component:
const { theme, toggleTheme } = useThemeStore();

// Sidebar footer with theme toggle:
<div className={styles.sidebarFooter}>
  <Button variant="ghost" size="sm" onClick={toggleTheme} className="w-full justify-start gap-2">
    {theme === 'dark' ? '☀️' : '🌙'} {theme === 'dark' ? 'Light' : 'Dark'}
  </Button>
  <Separator />
  <span className={styles.mcpBadge}>MCP ✓</span>
</div>
```

- [ ] **Step 3: Update AppShell CSS for responsive layout**

```css
/* AppShell.module.css additions */
.shell {
  display: flex;
  height: 100vh;
}

.sidebar {
  width: 240px;
  min-width: 240px;
  display: flex;
  flex-direction: column;
  border-right: 1px solid hsl(var(--border));
  background: hsl(var(--background));
}

@media (max-width: 768px) {
  .sidebar {
    display: none;
  }
  .sidebar.mobileOpen {
    display: flex;
    position: fixed;
    left: 0;
    top: 0;
    bottom: 0;
    z-index: 50;
  }
}
```

- [ ] **Step 4: Update WorkflowCanvas theme awareness**

The React Flow component already uses CSS variables from globals.css. Ensure nodes use `dark:` variants as shown in Task 3 node components.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/stores/theme-store.ts frontend/src/layouts/
git commit -m "feat: add dark/light theme toggle and responsive sidebar"
```

---

### Task 8: Migrate Existing Views to shadcn/ui

**Files:**
- Modify: `frontend/src/views/HomeView.tsx`
- Modify: `frontend/src/views/SkillsView.tsx`
- Modify: `frontend/src/views/RunMonitorView.tsx`
- Modify: `frontend/src/components/ExportMenu.tsx`
- Modify: `frontend/src/components/RunDialog.tsx`
- Modify: `frontend/src/components/NewOrgForm.tsx`

**Overview:** Migrate all existing views to use shadcn/ui components (Button, Card, Dialog, Form, Table, etc.) and Tailwind CSS classes. Remove CSS Modules imports where possible.

- [ ] **Step 1: Migrate HomeView**

Replace the current custom-styled org card grid with shadcn/ui Card components. Replace buttons with `<Button>`. Keep the same layout but use Tailwind classes instead of CSS modules.

```typescript
// Key changes to HomeView.tsx:
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

// Replace:
// <div className={styles.card}> with:
// <Card>
//   <CardHeader>
//     <CardTitle>{org.name}</CardTitle>
//     <CardDescription>{org.description}</CardDescription>
//   </CardHeader>
//   <CardContent>...info...</CardContent>
// </Card>
```

- [ ] **Step 2: Migrate SkillsView**

Replace the skill table/list with shadcn/ui Table or Card components.

- [ ] **Step 3: Migrate RunMonitorView**

Replace the run detail view with shadcn/ui components.

- [ ] **Step 4: Migrate Dialogs and Forms**

Replace NewOrgForm with shadcn/ui Form and Dialog components. Replace RunDialog similarly.

- [ ] **Step 5: Run tests**

Run: `cd frontend && npx vitest run`
Expected: All tests pass

- [ ] **Step 6: Run E2E tests**

Run: `cd frontend && npx playwright test --config=e2e/playwright.config.ts`
Expected: All 14+ E2E tests pass

- [ ] **Step 7: Commit**

```bash
git add frontend/src/views/ frontend/src/components/
git commit -m "feat: migrate views to shadcn/ui components"
```

---

### Task 9: E2E Tests for Workflow Editor

**Files:**
- Create: `frontend/e2e/workflow.spec.ts`

**Overview:** Write Playwright E2E tests for the workflow editor: drag nodes, connect them, edit properties, apply templates.

- [ ] **Step 1: Write workflow spec tests**

```typescript
// frontend/e2e/workflow.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Workflow Editor', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Create an org and navigate to workflow tab
    await page.click('text=New Org');
    await page.fill('input[name="name"]', 'TestOrg');
    await page.click('button:has-text("Create")');
    await page.click('button:has-text("Workflow")');
  });

  test('should display workflow canvas', async ({ page }) => {
    await expect(page.locator('.react-flow')).toBeVisible();
    await expect(page.locator('.react-flow__controls')).toBeVisible();
  });

  test('should drag agent node from toolbar', async ({ page }) => {
    const agentBtn = page.locator('text=Agent');
    const canvas = page.locator('.react-flow');
    await agentBtn.dragTo(canvas);
    // Should now have one node
    await expect(page.locator('.react-flow__node')).toBeVisible();
  });

  test('should select node and show properties', async ({ page }) => {
    // First drag an agent
    await page.locator('text=Agent').dragTo(page.locator('.react-flow'));
    await page.locator('.react-flow__node').click();
    await expect(page.locator('text=Properties')).toBeVisible();
    await expect(page.locator('text=Role')).toBeVisible();
  });

  test('should navigate to template library', async ({ page }) => {
    await page.goto('/templates');
    await expect(page.locator('text=Org Scaffold')).toBeVisible();
    await expect(page.locator('text=Audit Run')).toBeVisible();
  });

  test('should apply a template', async ({ page }) => {
    await page.goto('/templates');
    await page.locator('button:has-text("Apply Template")').first().click();
    // Should navigate back to workflow view with template loaded
    await expect(page.locator('.react-flow__node')).toBeVisible();
  });
});
```

- [ ] **Step 2: Run E2E tests**

Run: `cd frontend && npx playwright test --config=e2e/playwright.config.ts e2e/workflow.spec.ts`
Expected: All workflow tests pass

- [ ] **Step 3: Commit**

```bash
git add frontend/e2e/workflow.spec.ts
git commit -m "test: add workflow editor e2e tests"
```

---

### Task 10: Polish & Performance

**Files:**
- Modify: `frontend/src/components/workflow/WorkflowCanvas.tsx`
- Modify: `frontend/src/stores/workflow-store.ts`

**Overview:** Add undo/redo, auto-layout with dagre, validation, and performance optimization for large workflows.

- [ ] **Step 1: Add undo/redo with command history**

Implement a simple command history stack in workflow-store with `past`, `present`, `future` arrays. Push state on every node/edge change.

```typescript
// Enhanced workflow-store with undo/redo:
interface HistoryState {
  past: Array<{ nodes: Node[]; edges: Edge[] }>;
  present: { nodes: Node[]; edges: Edge[] };
  future: Array<{ nodes: Node[]; edges: Edge[] }>;
}
```

- [ ] **Step 2: Add dagre auto-layout**

```typescript
// Auto-layout function using dagre:
import dagre from 'dagre';

export function layoutNodes(nodes: Node[], edges: Edge[]): Node[] {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'TB', nodesep: 50, ranksep: 100 });

  nodes.forEach(n => g.setNode(n.id, { width: 180, height: 80 }));
  edges.forEach(e => g.setEdge(e.source, e.target));

  dagre.layout(g);
  return nodes.map(n => ({
    ...n,
    position: { x: g.node(n.id).x - 90, y: g.node(n.id).y - 40 },
  }));
}
```

- [ ] **Step 3: Add validation**

```typescript
// Validate workflow for: disconnected nodes, circular deps, missing required fields
export function validateWorkflow(nodes: Node[], edges: Edge[]): string[] {
  const errors: string[] = [];
  // Check for nodes with no connections (except start/end)
  // Check for circular dependencies
  // Check required fields on each node type
  return errors;
}
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/workflow/ frontend/src/stores/workflow-store.ts
git commit -m "feat: add undo/redo, auto-layout, and workflow validation"
```
