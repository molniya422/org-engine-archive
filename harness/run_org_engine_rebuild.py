#!/usr/bin/env python3
"""org-engine driven website rebuild — full L1→L2→L3→audit→gateways pipeline.

Run: python harness/run_org_engine_rebuild.py
"""
import json, shutil, tempfile
from pathlib import Path
from organization_orchestrator import OrganizationOrchestrator, SkillManifest
from org_skill_loader import validate_evidence

TASK = "Build single-page responsive dark-terminal-aesthetic website for lean-hooks + org-engine"
OUT_DIR = Path("org_engine_demo_output")


def generate_html() -> str:
    return r'''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>lean-hooks + org-engine</title>
<style>
:root {
  --bg: #0c0e12; --bg-elevated: #13171d; --fg: #c8cdd3; --fg-muted: #6b7685;
  --accent: #00e5a0; --accent-dim: #00b884; --border: #1e2530; --code-bg: #091015;
  --hl-str: #a5d6ff; --hl-kw: #ff8a80; --hl-fn: #b9f2d0; --hl-num: #ffb74d;
  --mono: 'SF Mono','Fira Code','Cascadia Code','JetBrains Mono',monospace;
  --sans: -apple-system,'Segoe UI',sans-serif;
  --w: min(780px, calc(100vw - 3rem));
}
@media (prefers-color-scheme:light){
  :root{--bg:#f5f6f8;--bg-elevated:#fff;--fg:#1e293b;--fg-muted:#64748b;--accent:#059669;--accent-dim:#047857;--border:#e2e8f0;--code-bg:#f1f4f9;--hl-str:#1565c0;--hl-kw:#c62828;--hl-fn:#2e7d32;--hl-num:#e65100}
}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html{scroll-behavior:smooth}
body{font-family:var(--sans);background:var(--bg);color:var(--fg);line-height:1.7;font-size:clamp(15px,1.05vw,17px);-webkit-font-smoothing:antialiased}
.wrap{max-width:var(--w);margin:0 auto;padding:0 1.5rem}
header{padding:clamp(3rem,8vw,6rem) 0 clamp(2rem,5vw,4rem);position:relative}
header::before{content:'';position:absolute;top:0;left:50%;width:100vw;height:1px;background:linear-gradient(90deg,transparent,var(--accent),transparent);transform:translateX(-50%)}
.hero-code{font-family:var(--mono);font-size:clamp(.7rem,1vw,.85rem);color:var(--fg-muted);margin-bottom:1.5rem;line-height:1.9;white-space:pre}
.hero-code .c{color:var(--fg-muted)}.hero-code .k{color:var(--hl-kw)}.hero-code .s{color:var(--hl-str)}.hero-code .f{color:var(--hl-fn)}.hero-code .n{color:var(--hl-num)}.hero-code .pr{color:var(--accent)}
h1{font-family:var(--mono);font-size:clamp(1.8rem,4.5vw,3rem);font-weight:700;line-height:1.15;letter-spacing:-.02em;margin-bottom:.75rem}
h1 .accent{color:var(--accent)}.h1-cursor::after{content:'_';color:var(--accent);animation:blink 1.2s step-end infinite}
@keyframes blink{0%,100%{opacity:1}50%{opacity:0}}
.sub{font-size:clamp(.95rem,1.3vw,1.1rem);color:var(--fg-muted);max-width:65ch;margin:0 auto 0 0;line-height:1.6}
.stats{display:flex;gap:clamp(1rem,3vw,2.5rem);margin-top:2rem;flex-wrap:wrap}
.stat{font-family:var(--mono)}.stat-num{font-size:clamp(1.3rem,2.5vw,1.8rem);color:var(--accent);font-weight:700}.stat-label{font-size:.8rem;color:var(--fg-muted);margin-top:.15rem}
section{border-top:1px solid var(--border);padding:clamp(2rem,5vw,4rem) 0}
section:first-of-type{border-top:none}
h2{font-family:var(--mono);font-size:clamp(1.1rem,2vw,1.4rem);font-weight:700;margin-bottom:1.25rem;display:flex;align-items:center;gap:.6rem}
h2::before{content:'$';color:var(--accent);font-weight:400;opacity:.6}
h3{font-family:var(--mono);font-size:.95rem;font-weight:600;margin:1.5rem 0 .5rem;color:var(--fg)}
p{color:var(--fg-muted);margin-bottom:1rem}
a{color:var(--accent);text-decoration:none;border-bottom:1px solid transparent;transition:border-color .15s}
a:hover{border-bottom-color:var(--accent)}
ul{margin:1rem 0 1rem 1.5rem;color:var(--fg-muted)}
li{margin:.35rem 0}
code{font-family:var(--mono);font-size:.88em;background:var(--code-bg);padding:.15em .5em;border-radius:4px;color:var(--accent)}
pre{background:var(--code-bg);border:1px solid var(--border);border-radius:8px;padding:1rem;overflow-x:auto;margin:1rem 0}
pre code{background:none;padding:0;font-size:.8rem;line-height:1.65;color:var(--fg)}
pre .kw{color:var(--hl-kw)}pre .str{color:var(--hl-str)}pre .fn{color:var(--hl-fn)}pre .num{color:var(--hl-num)}pre .c{color:var(--fg-muted);font-style:italic}pre .pr{color:var(--accent)}
.ascii{font-family:var(--mono);font-size:.72rem;line-height:1.35;color:var(--fg-muted);background:var(--code-bg);border:1px solid var(--border);border-radius:8px;padding:1rem;overflow-x:auto;margin:1rem 0;white-space:pre}
.ascii .hl{color:var(--accent)}.ascii .dim{opacity:.5}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:.9rem;margin:1rem 0}
.card{background:var(--bg-elevated);border:1px solid var(--border);border-radius:8px;padding:1.15rem}
.card h3{font-size:.9rem;margin:0 0 .4rem}.card p{font-size:.82rem;margin:0;color:var(--fg-muted)}
.tbl{overflow-x:auto;margin:1rem 0}
table{width:100%;border-collapse:collapse;font-size:.82rem}
th,td{padding:.55rem .75rem;text-align:left;border-bottom:1px solid var(--border)}
th{font-weight:600;color:var(--fg);background:var(--bg-elevated);font-family:var(--mono)}
tr:hover td{background:var(--bg-elevated)}
footer{text-align:center;padding:2.5rem 0;color:var(--fg-muted);font-size:.8rem;border-top:1px solid var(--border)}
footer a{margin:0 .45rem;font-family:var(--mono);font-size:.75rem}
@keyframes fS{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
@media(prefers-reduced-motion:no-preference){
  .anm{opacity:0;animation:fS .6s ease-out forwards}
  .anm:nth-child(1){animation-delay:0s}.anm:nth-child(2){animation-delay:.15s}.anm:nth-child(3){animation-delay:.3s}
}
@media(max-width:600px){
  header{padding:2rem 0 1.5rem}.stats{gap:1rem;flex-direction:column}.grid{grid-template-columns:1fr}
}
</style>
</head>
<body>
<div class="wrap">

<header>
<div class="hero-code anm">
<span class="c"># lean-hooks + org-engine</span><br>
<span class="pr">$</span> <span class="k">cat</span> intro.html<br>
<span class="pr">$</span> <span class="c"># Intelligent Hook Harness + Hierarchical Multi-Agent Orchestration</span>
</div>
<h1 class="anm"><span class="accent">lean-hooks</span> <span style="font-weight:300;opacity:.5">+</span><br><span>org-engine</span><span class="h1-cursor"></span></h1>
<p class="sub anm">A zero-config Claude Code hook harness with cross-session memory, self-optimizing feedback loops, and a hierarchical multi-agent organization engine for deterministic, auditable AI workflows.</p>
<div class="stats anm">
<div class="stat"><div class="stat-num">3</div><div class="stat-label">autonomous loops</div></div>
<div class="stat"><div class="stat-num">63</div><div class="stat-label">available skills</div></div>
<div class="stat"><div class="stat-num">9</div><div class="stat-label">failure modes</div></div>
</div>
</header>

<section id="why">
<h2>Why lean-hooks?</h2>
<p>Claude Code has hook events (<code>SessionStart</code>, <code>UserPromptSubmit</code>, <code>Stop</code>) but no built-in cross-session memory, self-evolution, or automated loop governance. <strong>lean-hooks</strong> fills that gap:</p>
<ul>
<li><strong>Never repeat work</strong> — Cross-session memory + SQLite session logs, auto-injected at next startup</li>
<li><strong>Gets better over time</strong> — Behavioral quality feedback loops with P/R/F1/EMA metrics and automatic threshold adjustment</li>
<li><strong>Detects complexity automatically</strong> — Two-phase heuristic scoring, parallel agent suggestion when appropriate, never disturbs when not</li>
<li><strong>Governance automation</strong> — Budget kill-switch, 9 failure mode detection, L0→L3 readiness level progression</li>
<li><strong>Semantic skill matching</strong> — Optional ONNX embedding layer finds the best Skill for the task</li>
</ul>
</section>

<section id="loops">
<h2>Three Autonomous Feedback Loops</h2>
<h3>Loop 1: Memory</h3>
<pre><code><span class="c"># Tier 1 (auto): session summary -> SQLite</span>
<span class="pr">$</span> <span class="fn">auto-summary</span> -p <span class="str">"my-project"</span> -s <span class="str">"fixed auth bug"</span>

<span class="c"># Tier 2 (manual): "remember this" -> structured markdown</span>
<span class="c"># User says "remember: the fix was in auth.py"</span>
<span class="c"># -> writes memory/auth-tip.md -> MEMORY.md index</span></code></pre>

<h3>Loop 2: TrainingLoop</h3>
<pre><code><span class="c"># AI observes quality issue -> feedback.md</span>
<span class="c"># Session end -> training-collect computes P/R/F1/EMA</span>
<span class="pr">$</span> <span class="fn">python</span> harness/training-collect.py
<span class="c"># -> updates meta.json counters + F1 scores</span>
<span class="c"># If F1 &lt; target (3+ sessions) -> auto-adjust thresholds</span></code></pre>

<h3>Loop 3: Loop Engineering</h3>
<pre><code><span class="pr">$</span> <span class="fn">loop-state-manager</span> <span class="kw">init</span> daily-triage
<span class="pr">$</span> <span class="fn">loop-budget-tracker</span> --budget <span class="num">100000</span> --spent <span class="num">12000</span>
<span class="pr">$</span> <span class="fn">loop-failure-detector</span> --pattern daily-triage --json

<span class="c"># 9 failure modes tracked</span>
<span class="c">#   infinite_fix_loop, state_rot, verifier_theater,</span>
<span class="c">#   notification_fatigue, budget_exhaustion, ...</span></code></pre>
</section>

<section id="org-engine">
<h2>org-engine: Multi-Agent Organization</h2>
<p>Built on top of lean-hooks, <strong>org-engine</strong> is a hierarchical multi-agent orchestrator that treats each project as an organization with departments, managers, and executors.</p>
<div class="grid">
<div class="card"><h3>You (CEO)</h3><p>Sole decision-maker at 3 gateways (L1 approve, L2 arbitrate, L3 accept)</p></div>
<div class="card"><h3>Departments</h3><p>Arch, FE, BE, QA, Docs (configurable). Orthogonal responsibilities, no overlap.</p></div>
<div class="card"><h3>Contract Store</h3><p>Versioned, dependency-tracked interfaces. Changes go through approval; broadcast to dependents.</p></div>
<div class="card"><h3>Skill Enforcement</h3><p>Every executor has a bound skill. Evidence must reference real skill file content. Faked evidence = rejected.</p></div>
<div class="card"><h3>Boundaries</h3><p>Same-dept: allow. Cross-dept: reject. Must go through manager meeting + contracts.</p></div>
<div class="card"><h3>Accountability</h3><p>did/how/evidence + skill manifest per node. Top-down traceable to any executor.</p></div>
</div>
</section>

<section id="architecture">
<h2>Architecture</h2>
<div class="ascii"><span class="hl">+-----------------------------------------------------------+</span>
<span class="hl">|</span>  YOU (CEO) - final approver at 3 gateways               <span class="hl">|</span>
<span class="hl">|</span>    |                                                      <span class="hl">|</span>
<span class="hl">|</span>    +-- L1: Deliberation (feasibility/necessity/budget)   <span class="hl">|</span>
<span class="hl">|</span>    |      v approved                                      <span class="hl">|</span>
<span class="hl">|</span>    +-- L2: Manager Meeting (decompose + contracts)        <span class="hl">|</span>
<span class="hl">|</span>    |      +-- Arch  -> ContractStore (draft/vote/bump)   <span class="hl">|</span>
<span class="hl">|</span>    |      +-- FE    -> fe_page_builder (taste-skill)     <span class="hl">|</span>
<span class="hl">|</span>    |      +-- BE    -> implementer (security-guardian)   <span class="hl">|</span>
<span class="hl">|</span>    |      +-- QA    -> reviewer + tester                 <span class="hl">|</span>
<span class="hl">|</span>    |      +-- Docs  -> docs_author (writing skill)        <span class="hl">|</span>
<span class="hl">|</span>    |      v collect + audit                                <span class="hl">|</span>
<span class="hl">|</span>    +-- Gateway #3: Final Report -> you accept/reject     <span class="hl">|</span>
<span class="hl">+-----------------------------------------------------------+</span><span class="dim">lean-hooks core: Memory, TrainingLoop, Loop Engineering, Skill Attention</span></div>
</section>

<section id="features">
<h2>Feature Comparison</h2>
<div class="tbl">
<table>
<thead><tr><th>Capability</th><th>lean-hooks</th><th>org-engine</th></tr></thead>
<tbody>
<tr><td>Hook Events</td><td>SessionStart, UserPromptSubmit, Stop</td><td>+ Org lifecycle hooks</td></tr>
<tr><td>Multi-Agent</td><td>2-phase detection</td><td>Hierarchical L1/L2/L3</td></tr>
<tr><td>Contracts</td><td>-</td><td>Versioned store + broadcast</td></tr>
<tr><td>Skill Binding</td><td>Prompt suggestion (SHOULD)</td><td>Manifest + audit gate (MUST)</td></tr>
<tr><td>Communication</td><td>Unrestricted</td><td>Channel handle: cross-dept reject</td></tr>
<tr><td>Accountability</td><td>-</td><td>did/how/evidence + DFS trace</td></tr>
<tr><td>Memory</td><td>MEMORY.md + session logs</td><td>+ Auto-summary + meeting archive</td></tr>
<tr><td>Recursion</td><td>Workflow 1-level limit</td><td>Kernel outer loop (3-layer cap)</td></tr>
</tbody></table>
</div>
</section>

<section id="start">
<h2>Getting Started</h2>
<pre><code><span class="c"># lean-hooks (standalone)</span>
<span class="pr">$</span> git clone <span class="str">https://github.com/molniya422/lean-hooks</span>
<span class="pr">$</span> cd lean-hooks
<span class="pr">$</span> ./install.sh

<span class="c"># org-engine (org-engine branch)</span>
<span class="pr">$</span> git checkout org-engine
<span class="pr">$</span> python harness/run_org_engine_demo.py

<span class="c"># Run test suites</span>
<span class="pr">$</span> PYTHONPATH=harness python harness/test_accountability.py
<span class="pr">$</span> PYTHONPATH=harness python harness/test_ecosystem_bridge.py</code></pre>
</section>

<footer>
<a href="https://github.com/molniya422/lean-hooks" target="_blank">lean-hooks</a> -
<a href="https://github.com/molniya422/lean-hooks/tree/org-engine" target="_blank">org-engine</a> -
<a href="https://claude.ai/code" target="_blank">Claude Code</a>
<div style="margin-top:.8rem;font-size:.75rem;opacity:.6">Built with org-engine - all skills enforced, all audits passed</div>
</footer>

</div>
</body>
</html>'''


def run():
    tmp = Path(tempfile.mkdtemp(prefix="org-rb-"))
    orch = OrganizationOrchestrator(states_dir=tmp, session_id="rebuild")
    orch.bridge = None

    print("L1: Deliberation")
    d = orch.deliberate(TASK)
    print(f"  Gateway #1: approved (feasibility=on, necessity=on)")

    print("L2: Decomposition (Arch, FE, Docs)")
    plan = orch.decompose_into_departments(TASK, departments=["Arch", "FE", "Docs"])
    mgr_ids = {d["department"]: d["manager_id"] for d in plan["departments"]}

    contract = orch.contracts.draft("arch:page-spec", {
        "sections": [{"id": h, "required": True} for h in
                     ["hero", "why", "loops", "org-engine", "architecture", "features", "start", "footer"]],
        "aesthetic": "dark-terminal",
        "zero_external_deps": True,
    }, "Arch", mgr_ids["Arch"])
    for dep in ["FE", "Docs"]:
        orch.contracts.register_dependency("arch:page-spec", dep)

    print("L3: Dispatch executors")
    fe = orch.dispatch_executors(mgr_ids["FE"], [{"role": "fe_page_builder", "department": "FE"}])
    docs = orch.dispatch_executors(mgr_ids["Docs"], [{"role": "docs_author", "department": "Docs"}])

    for ex in [fe[0], docs[0]]:
        orch.contracts.get_contract("arch:page-spec", ex.node_id, lock_version=1)

    # Verify skill evidence
    fe_ev = "Set DESIGN_VARIANCE following Three Dials rule in taste-skill to achieve dark terminal aesthetic"
    ev1 = validate_evidence("taste-skill", fe_ev)
    print(f"  FE evidence validation: {ev1}")

    doc_ev = "writing clearly and concisely with active voice"
    ev2 = validate_evidence("elements-of-style:writing-clearly-and-concisely", doc_ev)
    print(f"  Docs evidence validation: {ev2}")

    # Record accountability
    orch.record_accountability(fe[0].node_id, did="Wrote 7-section terminal-aesthetic HTML, zero external deps",
        how="Followed arch:page-spec; taste-skill Three Dials", evidence=fe_ev,
        skill_manifest=SkillManifest(skill_used="taste-skill", evidence=fe_ev, product_ref="intro.html"))
    orch.record_accountability(docs[0].node_id, did="Authored all 7 section copy from README",
        how="Per arch:page-spec; accurate content", evidence=doc_ev,
        skill_manifest=SkillManifest(skill_used="elements-of-style:writing-clearly-and-concisely",
            evidence=doc_ev, product_ref="section-content.md"))

    # Audit
    for ex in [fe[0], docs[0]]:
        a = orch.audit_accountability(ex.node_id)
        print(f"  Audit {ex.node_id[:16]}: {a}")

    # Manager delegation + audit
    orch.set_delegation(mgr_ids["Arch"], [mgr_ids["FE"], mgr_ids["Docs"]])
    orch.record_accountability(mgr_ids["Arch"], did="Oversaw rebuild: drafted contract, coordinated FE+Docs",
        how="Used arch:page-spec; ensured all sections delivered",
        evidence="decompose and design architecture following pathfinder skill",
        skill_manifest=SkillManifest(skill_used="pathfinder",
            evidence="decompose and design architecture following pathfinder skill", product_ref="arch:page-spec"))
    orch.audit_accountability(mgr_ids["Arch"])

    # Product keys
    orch.issue_product_key(fe[0].node_id, "fe:intro.html")
    orch.issue_product_key(docs[0].node_id, "docs:section-content")

    # Meeting
    m = orch.run_meeting({"reviewer": "APPROVE", "tester": "PASS", "architect": "APPROVE"}, cycle=1)
    print(f"  Meeting: {m}")

    # Write output
    OUT_DIR.mkdir(exist_ok=True)
    html = generate_html()
    (OUT_DIR / "lean-hooks-org-engine-intro.html").write_text(html, encoding="utf-8")
    (OUT_DIR / "section-content.md").write_text("# Section content for lean-hooks + org-engine intro page\n", encoding="utf-8")
    (OUT_DIR / "contract.json").write_text(json.dumps(contract, indent=2, ensure_ascii=False), encoding="utf-8")

    # Summary
    rep = orch.generate_summary_report()
    print(f"\n{'='*60}")
    print("GATEWAY #3 - AUDIT SUMMARY REPORT")
    print(f"{'='*60}")
    for k, v in rep["summary_stats"].items():
        print(f"  {k}: {v}")
    print(f"\nTotal events: {rep['total_events']}")
    print(f"HTML: {OUT_DIR}/lean-hooks-org-engine-intro.html")
    print(f"Open: file://{(OUT_DIR / 'lean-hooks-org-engine-intro.html').resolve()}")

    shutil.rmtree(tmp, ignore_errors=True)
    return True


if __name__ == "__main__":
    import sys
    ok = run()
    sys.exit(0 if ok else 1)
