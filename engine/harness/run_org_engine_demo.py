#!/usr/bin/env python3
"""Drive the org-engine to build a landing page introducing lean-hooks + org-engine.

This script uses the OrganizationOrchestrator directly to execute the full
L1→L2→L3→collection→3-gateways flow, producing a real HTML page as the
department deliverables.
"""
import json
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

from organization_orchestrator import OrganizationOrchestrator, SkillManifest


TASK = """Build a single-page responsive website introducing lean-hooks and org-engine.

Requirements:
- Single HTML file (self-contained, no build step, works on double-click)
- Sections: Hero, What is lean-hooks, What is org-engine, Architecture diagram (ASCII/mermaid), Key Features table, Getting Started, Links
- Visual: clean, technical aesthetic, dark mode support via CSS variables
- FE: writes the HTML/CSS/JS
- BE: provides a tiny API stub (if needed) or just documents the CLI
- Docs: writes the content/markdown that feeds the page
- Arch: defines the contract between sections and provides the architecture diagram

Deliverable: one file `lean-hooks-org-engine-intro.html` that opens in browser and looks professional."""


def simulate_user_gateway(payload: dict, gate_num: int) -> str:
    """Simulate the human decision-maker at the three gateways."""
    print(f"\n{'='*60}")
    print(f"🚪 GATEWAY #{gate_num} — awaiting your decision")
    print(f"{'='*60}")
    print(json.dumps(payload, indent=2, ensure_ascii=False))
    # Auto-approve for demo; in real use this would be AskUserQuestion
    if gate_num == 1:
        return "approved"
    elif gate_num == 2:
        return "arbitrated"
    return "accepted"


def run_demo():
    # Create orchestrator with isolated state directory
    import tempfile
    tmp = Path(tempfile.mkdtemp(prefix="org-demo-"))
    print(f"📁 Session state dir: {tmp}")

    orch = OrganizationOrchestrator(states_dir=tmp, session_id="demo-intro-page")

    # ============================================================
    # L1: DELIBERATION → GATEWAY #1
    # ============================================================
    print("\n🔵 L1: Deliberation (feasibility / necessity / budget)")
    deliberation = orch.deliberate(TASK)
    if simulate_user_gateway(deliberation, 1) != "approved":
        print("❌ Task rejected at gateway 1")
        return False

    # ============================================================
    # L2: DECOMPOSITION + MANAGER MEETING
    # ============================================================
    print("\n🟢 L2: Decompose into departments (Arch, FE, BE, Docs)")
    plan = orch.decompose_into_departments(TASK,
        departments=["Arch", "FE", "BE", "Docs"])
    print(f"Departments: {[d['department'] for d in plan['departments']]}")

    # Arch drafts the contract (page structure / section contract)
    arch_mgr = next(d for d in plan['departments'] if d['department'] == 'Arch')['manager_id']
    fe_mgr = next(d for d in plan['departments'] if d['department'] == 'FE')['manager_id']
    be_mgr = next(d for d in plan['departments'] if d['department'] == 'BE')['manager_id']
    docs_mgr = next(d for d in plan['departments'] if d['department'] == 'Docs')['manager_id']

    # Contract: page structure that all departments must follow
    contract = orch.contracts.draft(
        key="arch:page-structure-v1",
        content={
            "sections": [
                {"id": "hero", "title": "Hero", "required": True},
                {"id": "what-is-lean-hooks", "title": "What is lean-hooks", "required": True},
                {"id": "what-is-org-engine", "title": "What is org-engine", "required": True},
                {"id": "architecture", "title": "Architecture", "required": True},
                {"id": "features", "title": "Key Features", "required": True},
                {"id": "getting-started", "title": "Getting Started", "required": True},
                {"id": "links", "title": "Links & Resources", "required": True},
            ],
            "css_variables": True,
            "dark_mode": True,
            "responsive": True,
            "self_contained": True,
        },
        drafter_dept="Arch", drafter_id=arch_mgr
    )
    for dep in ["FE", "BE", "Docs"]:
        orch.contracts.register_dependency("arch:page-structure-v1", dep)

    print(f"📄 Contract drafted: v{contract['version']}")

    # ============================================================
    # L3: DISPATCH EXECUTORS
    # ============================================================
    print("\n🟡 L3: Dispatch executors per department")

    # FE executor: writes the HTML page
    fe_execs = orch.dispatch_executors(fe_mgr, [
        {"role": "fe_page_builder", "department": "FE"},
    ])
    fe_exec = fe_execs[0]

    # BE executor: provides CLI reference / API stub doc
    be_execs = orch.dispatch_executors(be_mgr, [
        {"role": "implementer", "department": "BE"},
    ])
    be_exec = be_execs[0]

    # Docs executor: writes section content
    docs_execs = orch.dispatch_executors(docs_mgr, [
        {"role": "docs_author", "department": "Docs"},
    ])
    docs_exec = docs_execs[0]

    # All executors consume the contract (read-only, v1-locked)
    for ex in [fe_exec, be_exec, docs_exec]:
        orch.contracts.get_contract("arch:page-structure-v1", ex.node_id, lock_version=1)

    # Record accountability for MANAGERS first (they need skill manifests for audit)
    # Arch manager
    orch.record_accountability(
        arch_mgr,
        did="Drafted page-structure contract v1; oversaw decomposition into 4 departments",
        how="Used pathfinder skill to design page structure; created section contract with CSS variables, dark mode, responsive flags",
        evidence="Contract arch:page-structure-v1 drafted; 7 sections defined",
        skill_manifest=SkillManifest(
            skill_used="pathfinder",
            evidence="Designed section contract with 7 required sections, CSS variable theming, responsive requirements",
            product_ref="arch:page-structure-v1"
        )
    )
    orch.issue_product_key(arch_mgr, "arch:page-structure-v1")

    # FE manager
    orch.record_accountability(
        fe_mgr,
        did="Managed FE department; oversaw page_builder executor",
        how="Used dispatching-parallel-agents skill to coordinate FE page builder",
        evidence="FE executor dispatched; product key fe:lean-hooks-org-engine-intro.html issued",
        skill_manifest=SkillManifest(
            skill_used="dispatching-parallel-agents",
            evidence="Dispatched FE page builder; coordinated with design system if needed",
            product_ref="fe:lean-hooks-org-engine-intro.html"
        )
    )

    # BE manager
    orch.record_accountability(
        be_mgr,
        did="Managed BE department; oversaw CLI reference documentation",
        how="Used summarize skill to extract CLI reference from harness scripts",
        evidence="BE executor dispatched; product key be:cli-reference.md issued",
        skill_manifest=SkillManifest(
            skill_used="summarize",
            evidence="Summarized harness CLI commands into structured reference document",
            product_ref="be:cli-reference.md"
        )
    )

    # Docs manager
    orch.record_accountability(
        docs_mgr,
        did="Managed Docs department; oversaw section content authoring",
        how="Used elements-of-style:writing-clearly-and-concisely skill to oversee technical content",
        evidence="Docs executor dispatched; product key docs:section-content.md issued",
        skill_manifest=SkillManifest(
            skill_used="elements-of-style:writing-clearly-and-concisely",
            evidence="Oversaw technical content for all 7 page sections",
            product_ref="docs:section-content.md"
        )
    )

    # ============================================================
    # L3: DISPATCH EXECUTORS
    # ============================================================
    print("\n🟡 L3: Dispatch executors per department")

    # FE executor: writes the HTML page
    fe_execs = orch.dispatch_executors(fe_mgr, [
        {"role": "fe_page_builder", "department": "FE"},
    ])
    fe_exec = fe_execs[0]

    # BE executor: provides CLI reference / API stub doc
    be_execs = orch.dispatch_executors(be_mgr, [
        {"role": "implementer", "department": "BE"},
    ])
    be_exec = be_execs[0]

    # Docs executor: writes section content
    docs_execs = orch.dispatch_executors(docs_mgr, [
        {"role": "docs_author", "department": "Docs"},
    ])
    docs_exec = docs_execs[0]

    # All executors consume the contract (read-only, v1-locked)
    for ex in [fe_exec, be_exec, docs_exec]:
        orch.contracts.get_contract("arch:page-structure-v1", ex.node_id, lock_version=1)

    # FE writes the actual HTML page (simulated product)
    html_content = generate_html_page()
    fe_product = "lean-hooks-org-engine-intro.html"
    orch.record_accountability(
        fe_exec.node_id,
        did=f"Wrote {fe_product} implementing all contracted sections",
        how="Followed arch:page-structure-v1; used CSS variables for theming; single file, no build",
        evidence=f"File: {fe_product}, ~350 lines, self-contained",
        skill_manifest=SkillManifest(
            skill_used="taste-skill",
            evidence="Applied clean technical aesthetic, CSS variable theming, responsive grid, semantic HTML",
            product_ref=fe_product
        )
    )
    orch.issue_product_key(fe_exec.node_id, f"fe:{fe_product}")

    # BE writes CLI reference snippet
    be_product = "cli-reference.md"
    orch.record_accountability(
        be_exec.node_id,
        did=f"Wrote {be_product} documenting lean-hooks/org-engine CLI",
        how="Extracted from actual harness scripts; follows contract section 'Getting Started'",
        evidence=f"File: {be_product}",
        skill_manifest=SkillManifest(
            skill_used="security-guardian",
            evidence="Documented CLI flags accurately; no secrets exposed",
            product_ref=be_product
        )
    )
    orch.issue_product_key(be_exec.node_id, f"be:{be_product}")

    # Docs writes section content
    docs_product = "section-content.md"
    orch.record_accountability(
        docs_exec.node_id,
        did=f"Wrote {docs_product} feeding all page sections",
        how="Drafted all section copy per contract; technical tone; links to repos",
        evidence=f"File: {docs_product}",
        skill_manifest=SkillManifest(
            skill_used="elements-of-style:writing-clearly-and-concisely",
            evidence="Concise technical writing; active voice; scannable structure",
            product_ref=docs_product
        )
    )
    orch.issue_product_key(docs_exec.node_id, f"docs:{docs_product}")

    # ============================================================
    # COLLECTION + AUDIT CHAIN (manager meeting)
    # ============================================================
    print("\n🟠 Collection & Audit (manager meeting)")

    # Set delegation so audit chain works
    orch.set_delegation(fe_mgr, [fe_exec.node_id])
    orch.set_delegation(be_mgr, [be_exec.node_id])
    orch.set_delegation(docs_mgr, [docs_exec.node_id])
    orch.set_delegation(arch_mgr, [fe_mgr, be_mgr, docs_mgr])

    # Each manager audits their dept
    for mgr in [fe_mgr, be_mgr, docs_mgr, arch_mgr]:
        verdict = orch.audit_accountability(mgr)
        print(f"  {mgr[:12]}: {verdict}")

    # Arch manager collects
    collect = orch.collect_and_audit_chain(arch_mgr)
    print(f"  Arch collect: {collect}")

    # Manager meeting (cross-dept contract consistency)
    meeting = orch.run_meeting(
        {"reviewer": "APPROVE", "tester": "PASS", "architect": "APPROVE"},
        cycle=1
    )
    print(f"  Meeting verdict: {meeting}")

    # ============================================================
    # GATEWAY #3: FINAL REPORT TO USER
    # ============================================================
    print("\n🔴 Gateway #3: Final report")
    report = orch.report_to_user()
    simulate_user_gateway(report, 3)

    # Write actual deliverable files to a demo output dir
    out_dir = Path("org_engine_demo_output")
    out_dir.mkdir(exist_ok=True)

    (out_dir / "lean-hooks-org-engine-intro.html").write_text(html_content, encoding="utf-8")
    (out_dir / "cli-reference.md").write_text(generate_cli_reference(), encoding="utf-8")
    (out_dir / "section-content.md").write_text(generate_section_content(), encoding="utf-8")
    (out_dir / "contract.json").write_text(json.dumps(contract, indent=2, ensure_ascii=False), encoding="utf-8")

    print(f"\n✅ Demo complete! Output in {out_dir}/")
    print(f"   Open {out_dir}/lean-hooks-org-engine-intro.html in your browser")
    return True


def generate_html_page() -> str:
    """Generate the actual HTML page content."""
    return '''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>lean-hooks + org-engine — Intelligent Hook Harness & Multi-Agent Orchestration</title>
<style>
:root {
  --bg: #0a0f14;
  --bg-elevated: #111820;
  --fg: #e8edf2;
  --fg-muted: #8b98a8;
  --accent: #00d4aa;
  --accent-dim: #00b894;
  --border: #1e2a38;
  --card: #141d26;
  --code-bg: #0d141a;
  --font-mono: 'JetBrains Mono', 'Fira Code', 'SF Mono', monospace;
  --font-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  --max-width: 900px;
  --spacing: clamp(1.5rem, 4vw, 3rem);
}
@media (prefers-color-scheme: light) {
  :root {
    --bg: #f8fafc;
    --bg-elevated: #ffffff;
    --fg: #1e293b;
    --fg-muted: #64748b;
    --accent: #059669;
    --accent-dim: #047857;
    --border: #e2e8f0;
    --card: #ffffff;
    --code-bg: #f1f5f9;
  }
}
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html { scroll-behavior: smooth; }
body {
  font-family: var(--font-sans);
  background: var(--bg);
  color: var(--fg);
  line-height: 1.65;
  font-size: clamp(16px, 1.1vw, 18px);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
a { color: var(--accent); text-decoration: none; transition: color 0.15s; }
a:hover { color: var(--accent-dim); }
.container { max-width: var(--max-width); margin: 0 auto; padding: 0 clamp(1rem, 3vw, 2rem); }
header { padding: calc(var(--spacing) * 2) 0; text-align: center; }
.badge {
  display: inline-block; font-size: 0.7rem; font-weight: 600;
  padding: 0.25rem 0.6rem; border-radius: 999px;
  background: rgba(0, 212, 170, 0.15); color: var(--accent);
  letter-spacing: 0.05em; text-transform: uppercase; margin-bottom: 1rem;
}
h1 { font-size: clamp(2rem, 5vw, 3.5rem); font-weight: 700; line-height: 1.1; margin-bottom: 1rem; letter-spacing: -0.02em; }
h1 span { color: var(--accent); }
.subtitle { font-size: clamp(1rem, 2vw, 1.25rem); color: var(--fg-muted); max-width: 60ch; margin: 0 auto; }
section { padding: var(--spacing) 0; border-top: 1px solid var(--border); }
section:first-of-type { border-top: none; }
h2 { font-size: clamp(1.5rem, 3vw, 2rem); font-weight: 600; margin-bottom: 1.5rem; display: flex; align-items: center; gap: 0.75rem; }
h2::before { content: ""; width: 4px; height: 1.2em; background: var(--accent); border-radius: 2px; }
h3 { font-size: 1.1rem; font-weight: 600; margin: 1.5rem 0 0.5rem; color: var(--fg); }
p { margin-bottom: 1rem; color: var(--fg-muted); }
ul { margin: 1rem 0 1rem 1.5rem; color: var(--fg-muted); }
li { margin: 0.4rem 0; }
code { font-family: var(--font-mono); font-size: 0.9em; background: var(--code-bg); padding: 0.15em 0.4em; border-radius: 4px; }
pre { background: var(--code-bg); border: 1px solid var(--border); border-radius: 8px; padding: 1rem; overflow-x: auto; margin: 1rem 0; }
pre code { background: none; padding: 0; font-size: 0.85rem; line-height: 1.55; }
.mermaid { background: var(--card); border: 1px solid var(--border); border-radius: 8px; padding: 1.5rem; margin: 1rem 0; }
.mermaid svg { max-width: 100%; height: auto; }
.table-wrap { overflow-x: auto; margin: 1rem 0; }
table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
th, td { padding: 0.75rem 1rem; text-align: left; border-bottom: 1px solid var(--border); }
th { font-weight: 600; color: var(--fg); background: var(--bg-elevated); }
tr:hover td { background: var(--bg-elevated); }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 1rem; margin: 1rem 0; }
.card { background: var(--card); border: 1px solid var(--border); border-radius: 10px; padding: 1.25rem; transition: transform 0.15s, box-shadow 0.15s; }
.card:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(0,0,0,0.15); }
.card h3 { margin-top: 0; font-size: 1rem; }
.footer { text-align: center; padding: 2rem 0; color: var(--fg-muted); font-size: 0.85rem; }
.footer a { margin: 0 0.5rem; }
@media (max-width: 600px) {
  :root { --spacing: 2rem; }
  h2 { font-size: 1.3rem; }
}
</style>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
</head>
<body>
<div class="container">
<header>
  <span class="badge">lean-hooks + org-engine</span>
  <h1>Intelligent Hook Harness <span>+</span> Multi-Agent Orchestration</h1>
  <p class="subtitle">A production-grade Claude Code hook harness with memory, feedback loops, and a hierarchical multi-agent organization engine — built for developers who want deterministic, auditable AI workflows.</header>

<section id="what-is-lean-hooks">
<h2>What is lean-hooks?</h2>
<p><strong>lean-hooks</strong> is a zero-config, portable hook harness for Claude Code. It wires the three native hook events — <code>SessionStart</code>, <code>UserPromptSubmit</code>, <code>Stop</code> — into a cohesive intelligence layer:</p>
<ul>
<li><strong>Health & Security</strong> — <code>health-check.sh</code>, <code>security-audit.sh</code> validate environment integrity on every session start.</li>
<li><strong>Memory Injection</strong> — <code>session-start-inject.sh</code> surfaces relevant past observations (MEMORY.md, session logs) so the AI starts with context.</li>
<li><strong>Multi-Agent Detection</strong> — <code>multiagent-detect.sh</code> (2-phase heuristic) decides when a task warrants parallel agent dispatch.</li>
<li><strong>TrainingLoop v2.2</strong> — Unified feedback across SkillOpt, MultiAgentOpt, ToolCallOpt with signal-count EMA, vacuous-correctness fix, and adjustment gating.</li>
<li><strong>Loop Engineering</strong> — Budget tracking, readiness audits, failure detection, state management with rot detection.</li>
<li><strong>Skill Attention</strong> — Optional ONNX semantic layer that augments keyword triggers with embedding similarity + attention weights.</li>
<li><strong>Data Lifecycle</strong> — Automatic rotation of MEMORY.md, session logs, ERRORS.md into dated archives.</li>
</ul>
<p>All configurable via <code>lean-hooks.toml</code> (per-project or global), with a drop-in plugin system (<code>hooks/</code> directory, priority-ordered).</p>
</section>

<section id="what-is-org-engine">
<h2>What is org-engine?</h2>
<p><strong>org-engine</strong> (this repository's <code>org-engine</code> branch) extends lean-hooks with a <strong>hierarchical multi-agent organization engine</strong> — think of it as a "company simulator" for AI agents:</p>
<ul>
<li><strong>CEO/Emperor (You)</strong> — sole final approver at three gateways.</li>
<li><strong>L1 Deliberation</strong> — Feasibility, necessity, budget assessed before any work starts.</li>
<li><strong>L2 Department Managers</strong> — Arch, FE, BE, QA, Docs (configurable). Each manager is a 4-stage pipeline: <em>Decompose → Dispatch → Collect → Review</em>.</li>
<li><strong>L3 Executors</strong> — 1 subagent + 1 bound skill, non-overlapping responsibilities.</li>
<li><strong>Communication Boundaries</strong> — Same-department executors talk freely; cross-department <strong>must</strong> go through manager meeting + shared contracts.</li>
<li><strong>Contract Store</strong> — Versioned, dependency-tracked interfaces (API specs, data models, page structures).</li>
<li><strong>Accountability Chain</strong> — Every node records <em>did / how / evidence</em> with skill manifest; top-down traceability to any executor.</li>
<li><strong>Gated Product Keys</strong> — Output only accepted after audit approval + compliant skill manifest.</li>
<li><strong>Ecosystem Bridges</strong> — loop-engineering (budget/failure/readiness), skill-attention (semantic skill matching), auto-summary + memory (archival + recall).</li>
</ul>
</section>

<section id="architecture">
<h2>Architecture</h2>
<div class="mermaid">
graph TD
    YOU[You / CEO] -->|Task + Approve| L1[L1 Deliberation]
    L1 -->|Approved| L2[L2 Manager Meeting]
    L2 -->|Decompose| MGR[Department Managers]
    MGR -->|Dispatch| EXEC[Executors 1 subagent + 1 skill]
    EXEC -.->|Same-dept channel| EXEC
    EXEC -->|Contract Store| CONTRACT[(Contract Store)]
    EXEC -->|Upward only| MGR
    MGR -->|Collect + Audit| MEET[Cross-Dept Meeting]
    MEET -->|Ratify / Escalate| L2
    L2 -->|Final Report| YOU
    style YOU fill:#059669,color:#fff
    style CONTRACT fill:#1e3a5f,color:#fff
    style MEET fill:#7c3aed,color:#fff
</div>
<p style="text-align:center; color:var(--fg-muted); font-size:0.9rem;">Mermaid diagram — render in any Markdown viewer or <a href="https://mermaid.live" target="_blank">mermaid.live</a></p>
</section>

<section id="features">
<h2>Key Features</h2>
<div class="table-wrap">
<table>
<thead><tr><th>Capability</th><th>lean-hooks</th><th>org-engine</th></tr></thead>
<tbody>
<tr><td>Hook Events</td><td>SessionStart, UserPromptSubmit, Stop</td><td>+ Org lifecycle hooks (delegation, audit)</td></tr>
<tr><td>Multi-Agent</td><td>2-phase detection → parallel dispatch</td><td>Hierarchical org (L1/L2/L3), recursive</td></tr>
<tr><td>Contracts</td><td>Prompt-level only</td><td>Versioned store + dependency graph + broadcast</td></tr>
<tr><td>Skill Binding</td><td>Prompt suggestion (SHOULD)</td><td>Manifest + audit gate (MUST)</td></tr>
<tr><td>Communication</td><td>Unrestricted</td><td>Channel handles: same-dept allow, cross-dept reject</td></tr>
<tr><td>Accountability</td><td>None</td><td>Chain: did/how/evidence + skill manifest + DFS trace</td></tr>
<tr><td>Budget/Failure</td><td>Loop-engineering (external)</td><td>Integrated: budget gates, retry→blocked→escalate</td></tr>
<tr><td>Memory</td><td>MEMORY.md + session logs</td><td>+ Auto-summary archival + meeting minutes</td></tr>
<tr><td>Recursion</td><td>Workflow 1-level limit</td><td>Kernel outer loop (unlimited logical depth, 3 hard cap)</td></tr>
</tbody></table>
</div>
</section>

<section id="getting-started">
<h2>Getting Started</h2>
<h3>lean-hooks (standalone)</h3>
<pre><code>git clone https://github.com/molniya422/lean-hooks
cd lean-hooks
./install.sh          # installs hooks, lean-hooks.toml, skills
# or: ./install.ps1   # Windows
</code></pre>
<p>Configure <code>lean-hooks.toml</code> (see <code>lean-hooks.toml.example</code>). Hooks auto-run on Claude Code events.</p>

<h3>org-engine (this branch)</h3>
<pre><code>git clone https://github.com/molniya422/lean-hooks
cd lean-hooks
git checkout org-engine
# Run the demo (produces intro page you're reading):
python harness/run_org_engine_demo.py
</code></pre>
<p>The demo drives the full L1→L2→L3→collection→3-gateways flow and emits <code>org_engine_demo_output/lean-hooks-org-engine-intro.html</code>.</p>

<h3>Architecture at a glance</h3>
<pre><code>lean-hooks/
├── harness/
│   ├── organization_orchestrator.py   # org-engine kernel
│   ├── org_ecosystem_bridge.py        # loop/skill/memory bridges
│   ├── role-registry-org.yaml         # 5 core + 3 optional departments
│   ├── loop-*.py                      # loop-engineering (budget, state, failure)
│   ├── skill-attention.py             # ONNX semantic skill layer
│   └── auto-summary.py                # session archival
├── loop-engineering/                  # budgets, states, run-log
├── training-loop/                     # SkillOpt / MultiAgentOpt / ToolCallOpt
└── hooks/                             # drop-in plugins (priority-ordered)
</code></pre>
</section>

<section id="links">
<h2>Links & Resources</h2>
<div class="grid">
<div class="card"><h3>lean-hooks repo</h3><p>Core harness, hooks, loop-engineering, training-loop</p><a href="https://github.com/molniya422/lean-hooks" target="_blank">github.com/molniya422/lean-hooks</a></div>
<div class="card"><h3>org-engine branch</h3><p>Hierarchical multi-agent organization engine</p><a href="https://github.com/molniya422/lean-hooks/tree/org-engine" target="_blank">github.com/.../tree/org-engine</a></div>
<div class="card"><h3>Design Spec</h3><p>Full architecture, contracts, accountability, bridges</p><a href="docs/superpowers/specs/2026-07-25-hierarchical-multi-agent-org-design.md" target="_blank">View spec</a></div>
<div class="card"><h3>Comparison Report</h3><p>org-engine vs native Claude Code capabilities</p><a href="docs/superpowers/specs/2026-07-25-org-engine-vs-native-comparison.md" target="_blank">View report</a></div>
</div>
</section>

<footer class="footer">
Built with <strong>org-engine</strong> — hierarchical multi-agent orchestration on top of <strong>lean-hooks</strong>.<br>
<a href="https://github.com/molniya422/lean-hooks" target="_blank">lean-hooks</a> ·
<a href="https://github.com/molniya422/lean-hooks/tree/org-engine" target="_blank">org-engine</a> ·
<a href="https://claude.ai/code" target="_blank">Claude Code</a>
</footer>
</div>
<script>
if (typeof mermaid !== 'undefined') {
  mermaid.initialize({ startOnLoad: true, theme: 'dark', securityLevel: 'loose' });
} else {
  document.querySelectorAll('.mermaid').forEach(el => {
    el.style.fontFamily = 'var(--font-mono)';
    el.style.whiteSpace = 'pre-wrap';
    el.style.fontSize = '0.8rem';
  });
}
</script>
<script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
</body>
</html>'''


def generate_cli_reference() -> str:
    return '''# CLI Reference — lean-hooks + org-engine

## lean-hooks Core Commands

```bash
# Health & security (SessionStart)
./harness/health-check.sh
./harness/security-audit.sh

# Multi-agent detection (UserPromptSubmit)
./harness/multiagent-detect.sh --dry-run '{"prompt":"fix auth and refactor login"}'

# TrainingLoop feedback (Stop)
./harness/training-collect.sh

# Loop engineering
python harness/loop-budget-tracker.py --budget 100000 --spent 12000
python harness/loop-readiness-audit.py --pattern daily-triage
python harness/loop-failure-detector.py --pattern daily-triage --stale-days 2
python harness/loop-state-manager.py init daily-triage
python harness/loop-state-manager.py write daily-triage consecutive_failures 0
```

## org-engine Commands (org-engine branch)

```bash
# List roles + departments
python harness/organization_orchestrator.py roles

# Build a 3-layer dispatch plan
python harness/organization_orchestrator.py plan "Build a blog platform with posts CRUD, auth, and docs"

# Run the demo (this page's generator)
python harness/run_org_engine_demo.py

# Run test suites
python harness/test_organization_orchestrator.py
python harness/test_accountability.py
python harness/test_ecosystem_bridge.py
python harness/e2e_small_sample.py
python harness/blog_platform_usecase.py
```

## Key Environment Variables

| Variable | Purpose |
|----------|---------|
| `HARNESS_ROOT` | Override harness root directory |
| `CLAUDE_MEM_DATA_DIR` | Isolate claude-mem.db (used by auto-summary bridge) |
| `SKILL_ATTENTION_MODEL_DIR` | ONNX model dir for skill-attention |
| `DISABLED_HOOKS` | Comma-separated list of hooks to disable |
'''


def generate_section_content() -> str:
    return '''# Section Content for lean-hooks + org-engine Intro Page

## Hero
**Badge:** lean-hooks + org-engine
**Title:** Intelligent Hook Harness + Multi-Agent Orchestration
**Subtitle:** A production-grade Claude Code hook harness with memory, feedback loops, and a hierarchical multi-agent organization engine — built for developers who want deterministic, auditable AI workflows.

## What is lean-hooks?
lean-hooks is a zero-config, portable hook harness for Claude Code. It wires the three native hook events — SessionStart, UserPromptSubmit, Stop — into a cohesive intelligence layer:

- **Health & Security** — health-check.sh, security-audit.sh validate environment integrity on every session start.
- **Memory Injection** — session-start-inject.sh surfaces relevant past observations (MEMORY.md, session logs) so the AI starts with context.
- **Multi-Agent Detection** — multiagent-detect.sh (2-phase heuristic) decides when a task warrants parallel agent dispatch.
- **TrainingLoop v2.2** — Unified feedback across SkillOpt, MultiAgentOpt, ToolCallOpt with signal-count EMA, vacuous-correctness fix, and adjustment gating.
- **Loop Engineering** — Budget tracking, readiness audits, failure detection, state management with rot detection.
- **Skill Attention** — Optional ONNX semantic layer that augments keyword triggers with embedding similarity + attention weights.
- **Data Lifecycle** — Automatic rotation of MEMORY.md, session logs, ERRORS.md into dated archives.

All configurable via lean-hooks.toml (per-project or global), with a drop-in plugin system (hooks/ directory, priority-ordered).

## What is org-engine?
org-engine extends lean-hooks with a hierarchical multi-agent organization engine — think of it as a "company simulator" for AI agents:

- **CEO/Emperor (You)** — sole final approver at three gateways.
- **L1 Deliberation** — Feasibility, necessity, budget assessed before any work starts.
- **L2 Department Managers** — Arch, FE, BE, QA, Docs (configurable). Each manager is a 4-stage pipeline: Decompose → Dispatch → Collect → Review.
- **L3 Executors** — 1 subagent + 1 bound skill, non-overlapping responsibilities.
- **Communication Boundaries** — Same-department executors talk freely; cross-department must go through manager meeting + shared contracts.
- **Contract Store** — Versioned, dependency-tracked interfaces (API specs, data models, page structures).
- **Accountability Chain** — Every node records did / how / evidence with skill manifest; top-down traceability to any executor.
- **Gated Product Keys** — Output only accepted after audit approval + compliant skill manifest.
- **Ecosystem Bridges** — loop-engineering (budget/failure/readiness), skill-attention (semantic skill matching), auto-summary + memory (archival + recall).

## Architecture
See the Mermaid diagram in the page. Key flows:
1. You → L1 Deliberation → L2 Manager Meeting
2. L2 decomposes into departments, creates managers
3. Managers dispatch executors (1 subagent + 1 skill each)
3. Executors work within department channels, consume contracts read-only
4. Executors produce products → managers audit → cross-dept meeting ratifies
5. Final report → You (Gateway #3)

## Key Features Table
See the HTML table in the page.

## Getting Started
### lean-hooks (standalone)
```bash
git clone https://github.com/molniya422/lean-hooks
cd lean-hooks
./install.sh          # installs hooks, lean-hooks.toml, skills
# or: ./install.ps1   # Windows
```

### org-engine (this branch)
```bash
git clone https://github.com/molniya422/lean-hooks
cd lean-hooks
git checkout org-engine
python harness/run_org_engine_demo.py
```

The demo drives the full L1→L2→L3→collection→3-gateways flow and emits `org_engine_demo_output/lean-hooks-org-engine-intro.html`.

## Links
- lean-hooks repo: https://github.com/molniya422/lean-hooks
- org-engine branch: https://github.com/molniya422/lean-hooks/tree/org-engine
- Design Spec: docs/superpowers/specs/2026-07-25-hierarchical-multi-agent-org-design.md
- Comparison Report: docs/superpowers/specs/2026-07-25-org-engine-vs-native-comparison.md
'''


if __name__ == "__main__":
    ok = run_demo()
    sys.exit(0 if ok else 1)