# Org Engine Human Acceptance Test Plan

> **For agentic workers:** Execute this plan task-by-task. This is a black-box, human-style acceptance test; do not replace visible UI actions with unit tests, source inspection, or direct API assertions.

**Goal:** Use Org Engine Editor, the packaged Electron app, the real orchestration runtime, MCP entry point, and bridge installer as a human user would, then produce a reproducible acceptance report covering every user-visible capability and every failed or undiscoverable flow.

**Architecture:** Test the product from the outside in. The primary path is browser/Electron UI interaction: click visible controls, type into visible fields, drag workflow nodes, wait for visible state changes, reload, and reopen. Command-line actions are allowed only to launch the product, create isolated test data, seed otherwise unreachable learning/insight states, and verify the separate engine/bridge entry points.

**Tech Stack:** Windows 10/11, Chromium at `D:\Chromium\Application\chrome.exe`, Electron, React/Vite frontend, Fastify backend, WebSocket run monitor, Python orchestration harness, MCP stdio server, PowerShell bridge installer.

---

## 1. Non-negotiable test rules

1. Treat the application as a real product. Start from a clean browser context and discover features from the visible interface before using a direct route.
2. A passing unit test is not evidence that a human flow works. Every acceptance item needs an observed result and an evidence reference.
3. Use the UI for creation, editing, saving, validation, workflow construction, running, decisions, export, and learning actions whenever the control exists.
4. Use an API or filesystem operation only for test-data setup, cleanup, or a feature that has no UI entry point. Mark those actions as `fixture setup`, not as product evidence.
5. Do not silently repair the product while testing. If a case fails, preserve the state, capture evidence, record the exact step, and continue with the next independent case.
6. Do not use the real production home directory without a backup. Prefer an isolated `ORG_ENGINE_HOME`, an isolated learning directory, and a dedicated browser profile.
7. Do not delete user data recursively unless the resolved path has been checked and is inside the QA workspace. Keep all temporary data under `D:\claude-ecosystem\org-engine\manual-qa\`.
8. Run each case from a known state. At the start of a case, write down the URL, selected organization, active tab, and whether the backend/frontend are freshly restarted.
9. For every asynchronous operation, wait for a visible condition instead of sleeping blindly: button text changes, toast appears, route changes, status badge changes, or a new event is visible.
10. If a feature is implemented but not reachable through the visible UI, record both results separately: `implementation reachable by direct route` and `discoverable by normal user`.

## 2. Required deliverables

The executing model must create these artifacts under a dated directory such as `D:\claude-ecosystem\org-engine\manual-qa\2026-10-01\`:

- `environment.md` — OS, Node, Python, browser, current commit, ports, launch commands, and isolation paths.
- `case-results.md` — one row per case with `PASS`, `FAIL`, `BLOCKED`, or `NOT DISCOVERABLE`.
- `defects.md` — one defect per section using the template below.
- `screenshots\` — screenshots for every failure and every important completed flow.
- `screen-recordings\` — recordings for run/gateway, packaged Electron, and MCP flows when available.
- `exports\` — YAML/JSON/workflow files downloaded by the UI.
- `logs\` — only the minimum backend/runtime logs needed to explain a failure.
- `final-summary.md` — release recommendation, coverage counts, P0/P1/P2/P3 defects, and untested items.

Use this defect format:

```text
ID: OE-MAN-###
Severity: P0 | P1 | P2 | P3
Area: Home | Studio | Workflow | Run | Learning | MCP | Electron | Bridge | Engine
Environment: dev browser | packaged Electron | CLI
Precondition:
Steps to reproduce:
Expected:
Actual:
Evidence:
Frequency: always | intermittent | once
Data left behind:
Workaround:
```

Severity rules:

- `P0`: app cannot launch, data loss/corruption, security boundary bypass, or a run cannot be stopped.
- `P1`: a primary workflow cannot complete, a gateway decision is lost, or save/export/revert changes the wrong organization.
- `P2`: a secondary feature is broken, a visible error has a workaround, or a refresh loses non-critical state.
- `P3`: visual defect, wording issue, minor layout/accessibility issue, or a feature works only through an undiscoverable route.

## 3. Test identities and fixture data

Use stable names so screenshots and reports are easy to correlate:

- Primary organization: `human-qa-main`.
- Secondary organization: `human-qa-secondary`.
- Unicode organization: `人工测试团队`.
- Invalid organization input: `!!!`.
- Workflow draft: the workflow produced by applying a playbook in `仅工作流` mode.
- Normal task: `请把这个任务拆成架构、实现、测试和文档四个阶段，并在每个阶段完成后记录结果。`.
- Cancellation task: `执行一个足够长的多智能体任务，保持运行状态，等待我取消。`.
- Gateway task: `创建一个包含 Arch、FE、BE、QA、Docs 的小型项目，要求在每个网关停下来等待用户决定。`.

Before the first case, create a clean test workspace:

```powershell
$qaRoot = 'D:\claude-ecosystem\org-engine\manual-qa\2026-10-01'
New-Item -ItemType Directory -Force -Path $qaRoot, "$qaRoot\screenshots", "$qaRoot\screen-recordings", "$qaRoot\exports", "$qaRoot\logs" | Out-Null
```

Do not use `human-qa-main` as a real organization name outside this test run.

## 4. Environment and launch procedure

### 4.1 Record the baseline

1. Open PowerShell in `D:\claude-ecosystem\org-engine`.
2. Record the current branch and commit in `environment.md`.
3. Record `node --version`, `npm --version`, `python --version`, and the Chromium executable path.
4. Record whether `editor\dist\orchestrator-adapter.exe` exists.
5. Do not treat the following known baseline failures observed on October 1, 2026 as UI acceptance results; re-run them, record them under preflight, and continue with black-box testing where possible:
   - backend TypeScript build currently reports missing `reverted_commit` and `auto_applied` fields in the learning proposal type;
   - frontend TypeScript build currently reports a spread-type error in `EvolutionPanel.test.tsx`;
   - the Playwright web-server bootstrap may fail in this environment with Node `uv_os_get_passwd returned ENOMEM` before any browser case starts.

### 4.2 Start isolated development mode

Use two PowerShell windows. Keep both visible in the report.

**Backend window:**

```powershell
Set-Location D:\claude-ecosystem\org-engine\editor
$env:ORG_ENGINE_HOME = 'D:\claude-ecosystem\org-engine\manual-qa\2026-10-01\home'
$env:ORG_ENGINE_LEARNING_DIR = 'D:\claude-ecosystem\org-engine\manual-qa\2026-10-01\learning'
$env:PORT = '15172'
npx tsx backend-server\src\server.ts
```

Expected: the window stays running and reports a backend listening on port `15172`.

**Frontend window:**

```powershell
Set-Location D:\claude-ecosystem\org-engine\editor\frontend
$env:VITE_PROXY_TARGET = 'http://localhost:15172'
npx vite --host 127.0.0.1 --port 15173 --strictPort
```

Expected: Vite reports a local URL on port `15173`.

### 4.3 Open the product as a human

1. Start `D:\Chromium\Application\chrome.exe` with a new temporary profile if possible.
2. Open `http://localhost:15173/`.
3. Do not jump straight to a hash route during the first smoke case.
4. For every direct route used later, first note why a normal user could not reach it.

### 4.4 Stop and restart procedure

Use this procedure whenever a case requires a clean restart:

1. Finish or abandon the current case and record the visible state.
2. Close the browser tab.
3. Stop the frontend and backend windows with `Ctrl+C`.
4. Confirm no QA process is still listening on ports `15172` or `15173`.
5. Start the backend first, then the frontend.
6. Reopen the browser and verify whether saved organizations/workflows/runs remain visible.

## 5. Phase A — first launch and navigation smoke test

### SM-01: First launch shell

1. Open the root URL in a clean browser context.
2. Wait until the initial loading state disappears.
3. Confirm the left rail, top toolbar, main content area, organization list or empty state, and version indicator are visible.
4. Confirm there is no blank screen, unhandled exception dialog, persistent skeleton, or red error banner.
5. Capture a screenshot as `SM-01-home.png`.

Expected: the shell is usable within 10 seconds and the user can identify how to create or open an organization.

### SM-02: Normal navigation

1. Hover the collapsed left rail and confirm labels reveal without layout corruption.
2. Click each visible navigation item: home, 编排剧本, 技能, 会议记录, 通信审计, and 产物注册表.
3. On each page, wait for content or an intentional empty state.
4. Use the top-left back arrow on every non-home page.
5. Use browser refresh on each page and confirm the current route survives.
6. Record any page that is reachable only by typing a URL.

Expected: no navigation dead ends; refresh does not produce a blank page; back returns to the logical parent.

### SM-03: Theme and layout

1. Click the bottom theme button from light to dark.
2. Check the sidebar, cards, inputs, modal, workflow canvas, badges, and empty states for readable contrast.
3. Refresh the page and confirm the chosen theme remains.
4. Toggle back to light and repeat the contrast check.
5. Resize the browser to approximately `1024x700`, then `1440x900`.

Expected: no clipped primary controls, horizontal overflow, unreadable text, or canvas with zero height.

### SM-04: Diagnosis entry point

1. Click the bottom `诊断` button rather than typing the route.
2. Confirm health content loads.
3. Record the status of backend, schema, harness adapter, paths, workflow statistics, and runtime information.
4. Click every visible refresh/retry control.
5. Stop the backend, refresh the health page, and confirm the error is human-readable; restart the backend and confirm recovery.

Expected: health state clearly distinguishes available, unavailable, and recoverable services.

## 6. Phase B — organization lifecycle and Studio

### ORG-01: Create the default organization through the UI

1. Return to home.
2. Click the visible new/create organization control.
3. Enter `human-qa-main`.
4. Submit with the visible create button.
5. Wait for navigation to Studio.
6. Confirm the default organization contains the advertised departments: Arch, FE, BE, QA, Docs, Sec, and Design.
7. Confirm representative roles, role IDs, agent types, permissions, and bound skills are visible.
8. Return home and confirm the organization card is listed.
9. Refresh the browser and reopen the card.

Expected: create, redirect, persistence, and reload all work without an invisible API step.

### ORG-02: Empty and invalid name validation

1. Open the create organization form again.
2. Leave the name empty and observe whether the submit button is disabled or a visible validation message appears.
3. Enter `!!!` and submit.
4. Confirm no organization is created.
5. Enter a name with leading/trailing spaces and punctuation that should be normalized, submit, and record the final visible ID/name.

Expected: invalid input is blocked with a useful message; no empty or unexpected organization is silently created.

### ORG-03: Unicode organization name

1. Open a fresh create-organization page, not just a hash change inside the existing Studio.
2. Enter `人工测试团队`.
3. Submit and wait for the Studio route.
4. Confirm the organization opens and the Arch department is visible.
5. Return home, refresh, and reopen the organization.
6. Export it later under `EXP-02` and confirm the Unicode name survives.

Expected: Chinese-only names are accepted, remain readable, and do not create a blank or duplicate route.

### ORG-04: Structure tree and graph views

1. Open `human-qa-main` in Studio.
2. Stay on `组织结构`.
3. Inspect the tree view: expand/collapse departments and select at least three roles.
4. Switch to the graph view.
5. Select the same roles from the graph if the view exposes them.
6. Switch back to tree view and confirm selection does not corrupt the organization.

Expected: both views represent the same departments/roles and selection opens the role editor.

### ORG-05: Add and edit a department/role

1. Click `添加部门`.
2. Give the new department a unique name such as `ManualQA`.
3. Add a role using the visible add-role control in that department.
4. Set role ID to `manualqa.operator`, name to `operator`, and choose `general-purpose`.
5. Set a persona title and backstory.
6. Enable `Can Escalate`; leave `Can Veto` disabled.
7. Wait for the visible `已保存` state.
8. Refresh the page and confirm all edits remain.

Expected: edits are persisted as one coherent organization update; save status is not falsely positive.

### ORG-06: Role skill binding

1. Select the new `manualqa.operator` role.
2. Open the `Bound Skills` selector.
3. Add one available skill.
4. Add a second skill if available.
5. Remove the first skill using its visible remove control.
6. Confirm the role's skill badges and the Studio `技能绑定` tab agree.
7. Refresh and confirm the remaining binding persists.

Expected: skill additions/removals update the role and survive reload without converting arrays into an unexpected single value.

### ORG-07: Duplicate and broken role identifiers

1. Select a role and temporarily change its ID to the ID of another role.
2. Wait for save or validation feedback.
3. Open the `校验` tab.
4. Confirm duplicate IDs are surfaced as a blocking issue or the save is rejected.
5. Restore a unique ID and confirm the blocking issue clears.
6. If a workflow already references the role, change the ID and verify the binding panel reports the broken reference; repair it in `WF-07`.

Expected: uniqueness and cross-reference failures are visible and recoverable.

### ORG-08: Studio tab persistence

1. Visit `组织结构`, `工作流`, `技能绑定`, `校验`, `运行`, and `进化` one by one.
2. On each tab, record the first visible loading/empty/error state and the final state.
3. Refresh while on each tab.
4. Confirm the product either restores the tab intentionally or returns to a documented default without losing data.

Expected: no tab renders stale data from a previous organization or retains a previous organization's selection.

## 7. Phase C — workflow canvas as a human editor

### WF-01: Open a clean workflow canvas

1. In `human-qa-main`, open the `工作流` tab.
2. Confirm the canvas, node palette, connection selector, undo/redo, auto-layout, validation, clear, and save controls are visible.
3. Confirm the right properties panel shows a no-selection hint.
4. Confirm zoom controls, minimap, and canvas background are usable.

Expected: a user can understand how to add a node without reading source code.

### WF-02: Add every node type by dragging

1. Drag `智能体` to the canvas and drop it.
2. Drag `技能` to a separate location.
3. Drag `决策` to a separate location.
4. Drag `并行` to a separate location.
5. Drag `频道` to a separate location.
6. Drag `会议` to a separate location.
7. Select each node once and verify the right panel changes to the selected node type.
8. Move each node and confirm it remains selectable.

Expected: all six advertised node types can be created through visible drag-and-drop and remain in the canvas.

### WF-03: Edit each node's properties

1. Select the agent node and choose a valid organization role in `组织角色 (role_ref)`.
2. Enter an agent override if the panel exposes one, then click away and confirm the value remains.
3. Select the skill node; enter a skill ID and change timeout from its default.
4. Select the decision node; enter `results.length > 0` as its condition.
5. Select the parallel node; switch merge strategy from `全部完成` to `任一完成` and back.
6. Select the channel node; enter `api-design` as its channel key.
7. Select the meeting node; test `部门内`, `部长级`, and `决策`; enter a non-empty agenda.
8. Refresh only after saving and confirm all properties persist.

Expected: each editor accepts valid input, preserves it, and displays the value on the node or after reselecting.

### WF-04: Flow edges and message edges

1. Set the connection selector to `流程边`.
2. Drag from a source handle on the agent node to a target handle on the skill node.
3. Confirm the edge appears.
4. Set the selector to `消息边`.
5. Connect the channel or meeting node to another node.
6. Confirm the message edge is visually distinct from the flow edge.
7. Refresh after saving and confirm both edge kinds remain.

Expected: the selected connection mode controls the created edge; message edges are not silently stored as flow edges.

### WF-05: Undo, redo, auto-layout, delete, and clear

1. Add a seventh node and move it.
2. Click undo and confirm the latest change is reversed.
3. Click redo and confirm the change returns.
4. Click auto-layout and confirm nodes are arranged without disappearing.
5. Select one node and press `Delete` or `Backspace`; confirm only that node is removed.
6. Click `清空` and confirm the canvas becomes empty after any confirmation step.
7. Use undo after clear and confirm the previous graph returns if undo is advertised.

Expected: destructive actions affect only the intended graph and controls correctly enable/disable.

### WF-06: Save and reload an organization workflow

1. Recreate a small graph with at least three nodes and two edges.
2. Click the visible save button.
3. Wait for the toast or status saying the workflow was saved.
4. Navigate home, reopen `human-qa-main`, and open `工作流`.
5. Confirm node types, properties, edge kinds, and approximate positions remain.
6. Open the `运行` tab and confirm its workflow statistics match the saved graph.

Expected: save is durable across route changes, browser refresh, and backend restart.

### WF-07: Broken binding and repair

1. Start with an agent node bound to a valid role.
2. Return to `组织结构` and change that role ID to a new unique value.
3. Return to `工作流` and select the agent node.
4. Confirm the strong-binding panel reports an unresolved reference.
5. Select the new role from the role reference control or repair the node reference through the visible editor.
6. Confirm the error marker disappears after save/refresh.

Expected: broken references are visible, not silently ignored, and can be repaired without recreating the whole workflow.

### WF-08: Validation, isolated nodes, and cycle behavior

1. Leave one node disconnected and click workflow validation.
2. Confirm the result identifies the isolated node or equivalent issue.
3. Create a flow cycle if the canvas permits it.
4. Run validation again.
5. Confirm the cycle is rejected or clearly warned.
6. Remove the cycle and reconnect the graph into a valid path.
7. Confirm the validation result changes after the repair.

Expected: validation responds to the actual graph, not just the presence of nodes.

### WF-09: Draft workflow behavior

1. Open the playbook library and apply any playbook in `仅工作流` mode.
2. Confirm navigation goes to a workflow draft and the generated graph is visible.
3. Confirm the draft clearly says it is not bound to an organization.
4. Open the `运行` tab and confirm running is disabled with an actionable explanation.
5. Click save and confirm the advertised `workflow.json` download occurs.
6. Create or select an organization and verify the workflow can be attached through the visible path.

Expected: draft mode is safe, understandable, exportable, and cannot accidentally run against an unintended organization.

## 8. Phase D — playbook library

### PB-01: Browse and filter playbooks

1. Click `编排剧本` from the visible navigation.
2. Confirm the page title, explanatory copy, loading state, and playbook cards.
3. Switch through `全部`, `搭建`, `审计`, `部署`, and `研究`.
4. Confirm the card set changes or an intentional empty state appears.
5. Refresh on a filtered category.

Expected: filters are clickable, stable after refresh, and do not show data from the previous category.

### PB-02: Inspect a playbook

1. Open each built-in playbook card one at a time.
2. Confirm detail content, stage count, stage labels, tags, recommended usage, and parameters are readable.
3. Close the detail panel with its close control.
4. Reopen it and close with `Escape`.

Expected: detail open/close is reliable and does not leave an invisible overlay blocking the page.

### PB-03: Required parameter validation

1. Choose a playbook with required parameters.
2. Clear one required value.
3. Click `应用剧本`.
4. Confirm no navigation or partial application occurs.
5. Confirm the field-level error identifies the missing label.
6. Fill the value and apply again.

Expected: client-side validation blocks incomplete applications and successful application happens only after the field is valid.

### PB-04: Apply in all three modes

1. Apply one playbook with `仅工作流`; verify the draft flow under `WF-09`.
2. Return to the library and apply a second playbook with `新建组织`.
3. Confirm the newly created organization appears in Studio and later on home.
4. Return to `human-qa-main` and apply a third playbook with `应用到当前组织`.
5. Confirm the existing organization is still the target and its workflow changes visibly.
6. Refresh and verify the applied workflow is durable.

Expected: the three modes have distinct, understandable effects and never overwrite the wrong organization.

## 9. Phase E — skills and schema

### SK-01: Skills list and built-in agent types

1. Open `技能` from the sidebar.
2. Wait for cards to load.
3. Confirm skill names, descriptions, source badges, and paths are readable.
4. Confirm built-in agent types, if displayed, are visually distinguishable from scanned skills.
5. Refresh and confirm the list remains stable.

Expected: the page explains whether an item is a skill or built-in agent type.

### SK-02: Rescan with no extra path

1. Click `Rescan`/`重新扫描` with the extra path field empty.
2. Wait for the loading state to end.
3. Confirm the list returns and the page does not duplicate cards.

Expected: rescanning is idempotent and does not create duplicate skill entries.

### SK-03: Scan a real extra skill directory

Create a temporary skill only as fixture setup:

```powershell
$skillRoot = 'D:\claude-ecosystem\org-engine\manual-qa\2026-10-01\custom-skill'
New-Item -ItemType Directory -Force -Path $skillRoot | Out-Null
@'
---
name: human-qa-skill
description: A temporary skill used only for manual acceptance testing.
---
# Human QA Skill

Use this file to verify that the editor discovers a newly added skill.
'@ | Set-Content -Encoding UTF8 "$skillRoot\SKILL.md"
```

Then:

1. Enter the absolute `custom-skill` directory in the extra scan path field.
2. Click rescan.
3. Confirm `human-qa-skill` appears with source `skill` and the correct path.
4. Navigate to Studio, select a role, and confirm the new skill is available in the binding selector.
5. Bind it, save, refresh, and confirm it persists.

Expected: the product discovers an actual new skill, exposes it to role binding, and persists the binding.

### SK-04: Invalid and missing scan paths

1. Enter a path that does not exist.
2. Click rescan.
3. Confirm the user sees a useful empty/error result and the existing list is not destroyed.
4. Enter a file path instead of a directory if the UI accepts it.
5. Confirm the backend/frontend do not crash.

Expected: bad paths fail safely and leave the previous usable state intact.

### SK-05: Persisted scan path

1. Restart backend and frontend after `SK-03`.
2. Reopen the Skills page.
3. Confirm the custom skill is still discoverable without retyping the path, or record that the product claims persistence but loses it.

Expected: behavior matches the visible product wording; silent loss is a defect.

### SK-06: Schema viewer

1. Open the `Schema` tab on the Skills page.
2. Expand and collapse every visible section.
3. Scroll through the full schema.
4. Confirm required fields, types, and descriptions are not clipped or rendered as raw broken markup.
5. Refresh the page while the schema tab is selected.

Expected: schema browsing remains usable and does not block the rest of the application.

## 10. Phase F — real run and gateway interaction

This phase is the most important black-box test. Do not mark it passed because the start button accepted text. The run must produce visible runtime progress, gateway interaction, persistence, and a final state.

### RUN-00: Runtime readiness

1. Open `诊断`.
2. Confirm the orchestration adapter/harness is reported available.
3. If unavailable, record a `P1` runtime blocker with the exact path shown and continue only with UI-only cases.
4. Open `human-qa-main` and confirm the `运行` tab shows at least one department and one role.

### RUN-01: Start a normal run

1. Open Studio → `运行`.
2. Confirm the task field and recent-run area are visible.
3. Leave the task empty and confirm the start button is disabled or refuses submission.
4. Enter the normal task from Section 3.
5. Click `启动运行`.
6. Confirm navigation to the run monitor and a run ID.
7. Record the first visible status: queued, running, or equivalent.

Expected: one run is created for the selected organization and the monitor opens automatically.

### RUN-02: Live run monitor

1. Watch the monitor without refreshing for at least one event transition.
2. Confirm the status badge changes as the engine progresses.
3. Confirm the event list/timeline receives entries.
4. Confirm gateway, agent, meeting, communication, or completion events are human-readable.
5. Toggle auto-scroll off and on.
6. Click an event/timeline item and confirm the page scrolls to it.
7. Click `复制全部事件` and confirm a visible success/failure result.

Expected: the monitor is live, readable, and useful during a real run.

### RUN-03: Gateway #1 decision

1. Use the gateway task from Section 3 or another task known to pause at Gateway #1.
2. When the monitor shows a gateway prompt, confirm the gateway number, context, and question are visible.
3. Attempt to submit an empty decision and confirm it is blocked.
4. Enter `批准：继续拆分，并保留当前预算限制。`.
5. Submit once.
6. Confirm the prompt disappears or advances and the event list records the decision.
7. Refresh the monitor and confirm the decision is not requested again for the same state.

Expected: user input is required, validated, persisted, and delivered to the running engine exactly once.

### RUN-04: Gateway #2 arbitration or blocked path

1. Run a task that causes an audit failure, negotiation cap, or blocked state.
2. Confirm the monitor visibly changes to blocked/waiting and identifies Gateway #2.
3. Enter a clear arbitration decision.
4. Confirm the run either resumes, remains blocked with a reason, or records escalation according to the decision.
5. Capture the full monitor and event timeline.

Expected: a blocked run cannot silently proceed and Gateway #2 is visibly distinct from Gateway #1.

### RUN-05: Gateway #3 final acceptance

1. Continue a run until the final report is available.
2. Confirm the report contains summary statistics, audit events, and final status.
3. Choose the visible final accept/reject decision.
4. Confirm the resulting state is `done`, `blocked`, or equivalent and remains after refresh.
5. Navigate home and confirm the active-run banner, if present, is cleared or updated.

Expected: the final gate controls whether the result is accepted; no run is shown as successful before the final decision.

### RUN-06: Cancel a live run

1. Start the cancellation task.
2. While the status is queued/running, click `取消`.
3. Confirm the UI asks for confirmation if confirmation is designed.
4. Confirm the monitor changes to `已取消` and the process stops.
5. Refresh and reopen the run from history.
6. Confirm it remains cancelled and cannot accept gateway decisions.

Expected: cancel is safe, visible, durable, and cannot leave a ghost active run.

### RUN-07: Reconnect and history

1. Start a run and wait until at least one event exists.
2. Close the tab and reopen the run URL.
3. Confirm the persisted state snapshot and prior events appear.
4. Return to Studio → `运行`.
5. Confirm the run appears under `历史运行` with the correct task and status.
6. Click the history row and confirm it opens the same run.

Expected: WebSocket reconnection does not erase history or duplicate events.

### RUN-08: Runtime failure and recovery

1. Start a run only after recording the current state.
2. Stop the backend or make the adapter unavailable while the monitor is open.
3. Confirm the UI shows a connection/runtime error rather than an infinite spinner.
4. Restart the backend.
5. Refresh/reopen the run.
6. Record whether the product recovers, marks the run blocked, or loses it.

Expected: failure is explicit and recovery behavior is deterministic.

## 11. Phase G — governance and insight views

### GOV-01: Meetings view

1. Open `会议记录` from the sidebar before any suitable run and record its empty state.
2. Execute a run that produces a meeting.
3. Return to the page and click refresh.
4. Confirm each record shows type, participants, cycles, decision, timestamp, and related workflow information where available.
5. Refresh the browser and confirm records persist.

Expected: empty and populated states are both intentional and readable.

### GOV-02: Communication audit

1. Open `通信审计` before a run and record its empty state.
2. Execute a run with same-department and cross-department communication.
3. Refresh the view.
4. Confirm each row identifies sender, receiver, channel, allow/reject result, reason, and time.
5. Confirm rejected cross-department messages are not displayed as successful messages.

Expected: the page makes communication boundaries auditable to a non-developer.

### GOV-03: Product registry

1. Open `产物注册表` before a product-producing run and record its empty state.
2. Execute a run that issues product keys.
3. Refresh the view.
4. Confirm role, product key, audit-gate status, skill manifest/evidence, and time are visible.
5. Confirm blocked/unissued products are not presented as approved.

Expected: product keys are traceable to audit status and skill evidence.

### GOV-04: Cross-page consistency

1. Pick one completed run.
2. Compare its monitor events with Meetings, Communication Audit, and Product Registry.
3. Confirm IDs, timestamps, decisions, and statuses do not contradict one another.
4. Capture one screenshot from each page for the final report.

Expected: governance pages are views of the same run, not independent stale datasets.

## 12. Phase H — learning and evolution loop

The visible evolution UI is under Studio → `进化`. If no events/proposals exist naturally, seed only the isolated QA learning directory. Seeding is not evidence that the engine generated the proposal; it is only a way to test the UI state machine.

### LEARN-01: Empty state and refresh

1. Open Studio → `进化` with an empty learning directory.
2. Confirm `暂无学习事件` and `暂无提案` are readable.
3. Click refresh.
4. Stop/restart the backend and confirm the empty state remains stable.

### LEARN-02: Reject a proposal

1. Seed one `status: proposed` proposal in the isolated learning directory with a visible rationale and evidence count.
2. Open Studio → `进化` and confirm the proposal card appears.
3. Click `拒绝`.
4. Confirm the status changes to rejected and the approve/reject buttons disappear.
5. Refresh and confirm the rejected state persists.

### LEARN-03: Approve a proposal

1. Seed a second proposed change that adds a role or rebinds a skill in `human-qa-main`.
2. Open the evolution panel.
3. Click `批准`.
4. Confirm the card shows applied status and a commit ID.
5. Return to the organization structure and confirm the proposed role/skill change is visible.
6. Open the org file only after the UI check to verify the visible change was persisted.

Expected: approval changes the organization and records a traceable commit; the UI does not claim success if the file was not changed.

### LEARN-04: Revert an applied proposal

1. On the applied proposal, click `回滚`.
2. Confirm the card changes to reverted and shows a reverted commit.
3. Return to the organization and confirm the applied role/skill change is gone.
4. Refresh the evolution panel and confirm the reverted state persists.

Expected: revert restores the prior organization state and is visible in both the proposal and organization UI.

### LEARN-05: Invalid transition and error recovery

1. Attempt to approve a rejected proposal if the UI exposes no button; record whether the correct button absence prevents it.
2. Attempt to revert a proposed/rejected proposal through any visible action.
3. Confirm the error is shown without clearing the rest of the proposal list.
4. Refresh and confirm the state was not incorrectly changed.

### LEARN-06: L3 auto-apply and breaker

1. Prepare an isolated organization with autonomy level `l3` and several low-risk proposed rebinds.
2. Trigger the visible auto-apply control if one exists; if no control exists, record that auto-apply is not user-discoverable and invoke the documented CLI/API entry point only as a separate integration check.
3. Confirm low-risk proposals apply, applied commits appear, and the UI refresh shows the new states.
4. Add enough proposals to exceed the configured auto-apply budget.
5. Trigger auto-apply again.
6. Confirm the breaker skips additional proposals and reports applied/skipped counts rather than silently applying everything.

## 13. Phase I — export, importability, and data safety

### EXP-01: Export YAML

1. Open `human-qa-main` Studio.
2. Click the visible export control.
3. Choose `下载 YAML`.
4. Confirm a file is downloaded under the QA `exports` directory.
5. Open the downloaded file in a text editor.
6. Confirm organization name, departments, roles, budget, and workflow are present.

### EXP-02: Export JSON and Unicode

1. Open the Unicode organization.
2. Choose `下载 JSON`.
3. Confirm the file parses as UTF-8 JSON.
4. Confirm the Chinese name and role data are intact.
5. Use the copy path/copy config controls and confirm the user receives a visible success indication.

### EXP-03: Export failure

1. Stop the backend while the export menu is available.
2. Try YAML and JSON export.
3. Confirm the UI shows `导出失败` or an equivalent actionable error.
4. Restart the backend and confirm export works again.

## 14. Phase J — MCP as an actual user integration

### MCP-01: Install information

1. From a browser or the visible product help path, locate the MCP installation information.
2. Confirm it names `org-engine-editor`, shows a daemon URL, and gives a runnable command.
3. Copy the command into `environment.md`; do not change the real global Claude configuration yet.

### MCP-02: Launch the stdio server

1. Build or use the existing MCP bundle only if the product build gate permits it.
2. Start the MCP CLI in a separate PowerShell process with the isolated daemon URL.
3. Send an MCP `initialize` request through a real MCP-capable client or the documented CLI integration.
4. Send `tools/list`.
5. Record the tool names and descriptions returned to the client.

Expected: the process speaks MCP over stdout and does not print diagnostic noise into the protocol stream.

### MCP-03: Exercise every MCP tool

For each tool, invoke it from the MCP client, not by calling the HTTP endpoint directly:

1. `list_orgs` — confirm the QA organizations appear.
2. `get_org` — confirm department/role data matches the UI.
3. `export_org` with YAML and JSON — compare content with UI exports.
4. `validate_org` — run it against a valid organization and then a deliberately invalid organization.
5. `list_skills` — compare skill names with the Skills page.
6. `start_run` — start a small run and capture the returned run ID.
7. `list_runs` — confirm the run appears.
8. `get_run` — confirm status and events are readable.
9. `cancel_run` — cancel a live run and confirm the UI shows the same cancelled state.
10. Invoke an unknown tool name and confirm the client receives a structured error rather than a crashed server.

## 15. Phase K — packaged Electron application

Do not call the packaged test passed merely because an installer was generated. The installed application must be used visibly.

### DESKTOP-01: Build gate

1. Run the editor build/package command from `D:\claude-ecosystem\org-engine\editor`.
2. Record every build failure exactly; do not hide TypeScript failures behind a successful esbuild bundle.
3. If the installer is produced, record its full path and hash.

### DESKTOP-02: Install and first launch

1. Install to a QA location on the D drive, not into a production directory.
2. Launch the installed application.
3. Confirm the window title, minimum size, sidebar, toolbar, and home view appear.
4. Confirm the backend starts automatically and the health page reports the correct runtime paths.
5. Close and relaunch the app.

Expected: launch works without a terminal, blank `file://` route, missing backend dialog, or stale port.

### DESKTOP-03: Hash navigation and core desktop flow

1. Click every sidebar route in the packaged app.
2. Open an organization, edit a role, save it, and reopen it.
3. Build and save a workflow.
4. Export YAML and JSON.
5. Start and cancel a run.
6. Close and relaunch the app; verify persistence.

### DESKTOP-04: Single-instance behavior

1. Launch the installed application twice.
2. Confirm the second launch does not create a broken second backend/window.
3. Confirm the existing window is focused or the product shows a clear single-instance behavior.

### DESKTOP-05: Packaged failure paths

1. Temporarily move the harness executable or schema out of the packaged location in a copy of the installation.
2. Launch the app.
3. Confirm the health page identifies the missing component.
4. Confirm the app does not silently report a healthy runtime.
5. Restore the files and confirm recovery.

## 16. Phase L — bridge installer and hook-facing behavior

Run installer tests against a disposable configuration root or a dedicated Windows profile. Never mutate the user's real Claude configuration without a backup and explicit approval.

### BRIDGE-01: Fresh installation

1. Create an empty disposable Claude configuration directory under the QA workspace.
2. Run the documented PowerShell installer against that location.
3. Confirm hooks, templates, feedback files, memory files, and settings are created.
4. Start a fresh Claude-style session or invoke the installed hook entry points as documented.
5. Confirm SessionStart produces health/memory context, UserPromptSubmit produces the expected detection context, and Stop produces training-loop output.

### BRIDGE-02: Existing configuration preservation

1. Add a sentinel setting and sentinel text to the disposable configuration.
2. Run the installer again.
3. Confirm the sentinel values remain unchanged.
4. Confirm the installer is idempotent and does not duplicate hook registrations.

### BRIDGE-03: Disabled hook and failure behavior

1. Disable one hook using the documented configuration mechanism.
2. Trigger its event.
3. Confirm the hook is skipped while other hooks continue.
4. Make a disposable hook return an error or exceed its timeout.
5. Confirm the session continues and `ERRORS.md` records the failure.

### BRIDGE-04: Uninstall/cleanup or rollback

1. Follow the documented removal or manual rollback procedure.
2. Confirm only QA files are removed.
3. Confirm the sentinel configuration is restored exactly.

## 17. Phase M — responsive, accessibility, and hostile-input pass

Run this pass after the functional cases, using the same visible UI:

1. Resize to `1024x700`, `1280x800`, and `1440x900`.
2. Navigate every page and open every modal/panel at each size.
3. Use only keyboard for one complete create/edit/export path: `Tab`, `Shift+Tab`, `Enter`, `Escape`, and arrow keys for selects.
4. Confirm focus is visible and never trapped behind a closed dialog.
5. Enter long organization names, long role backstories, multiline task text, Unicode punctuation, emoji, and pasted multiline content.
6. Enter quotes, angle brackets, shell-looking strings, and newline-heavy text into task, persona, agenda, and channel fields.
7. Confirm text remains escaped and layout remains usable.
8. Reopen the product after each hostile-input case and confirm no stored data is corrupted.

## 18. Phase N — final cleanup and report

1. Finish all independent cases before cleanup.
2. Export the final QA organizations for evidence.
3. Cancel any remaining active runs.
4. Close the browser, frontend, backend, MCP process, and Electron app.
5. Confirm no process still listens on ports `15172` or `15173`.
6. Confirm all temporary paths are under the QA workspace.
7. Remove only the resolved QA workspace after copying the report and evidence to the agreed archive location.
8. In `case-results.md`, count `PASS`, `FAIL`, `BLOCKED`, and `NOT DISCOVERABLE`.
9. In `final-summary.md`, answer these questions explicitly:
   - Can a new user launch and understand the product without reading source code?
   - Can the user create, edit, validate, save, export, and reopen an organization?
   - Can the user build, validate, save, and reload a workflow with all six node types and both edge kinds?
   - Can the user run a real task, answer all three gateways, observe events, reconnect, and cancel?
   - Are meetings, communication audits, product keys, learning proposals, and reverts trustworthy and consistent?
   - Does MCP work through a real MCP client rather than a direct HTTP request?
   - Does the packaged Electron app work without a terminal?
   - Does the bridge install safely preserve existing configuration?
10. Recommend one of: `accept`, `accept with P2/P3 follow-up`, `hold for P1 fixes`, or `reject for P0/P1 blockers`.

## 19. Coverage matrix

| User-visible area | Primary cases | Required evidence |
|---|---|---|
| Launch/navigation/theme/diagnostics | SM-01 to SM-04 | shell, dark mode, health, recovery |
| Organization creation/editing | ORG-01 to ORG-08 | created org, edited role, validation, reload |
| Workflow canvas | WF-01 to WF-09 | all node types, both edges, save/reload, binding repair |
| Playbooks | PB-01 to PB-04 | filters, detail, parameter error, three apply modes |
| Skills/schema | SK-01 to SK-06 | scan, custom skill, persistence, schema |
| Real orchestration | RUN-00 to RUN-08 | monitor, events, gateways, cancel, reconnect |
| Governance views | GOV-01 to GOV-04 | meetings, comm, products, cross-page consistency |
| Learning loop | LEARN-01 to LEARN-06 | reject, approve, commit, revert, breaker |
| Export/data safety | EXP-01 to EXP-03 | YAML, JSON, Unicode, failure recovery |
| MCP | MCP-01 to MCP-03 | initialize, tools/list, every tool call |
| Electron packaging | DESKTOP-01 to DESKTOP-05 | installer, file protocol, persistence, single instance |
| Bridge/hooks | BRIDGE-01 to BRIDGE-04 | fresh install, preservation, disabled/failure, rollback |
| Responsive/accessibility/security | Phase M | keyboard, sizes, hostile input |

## 20. Handoff instruction to the executing model

Execute phases in order. Do not skip a case because a code-level test already exists. If a prerequisite is unavailable, mark dependent cases `BLOCKED` with the exact prerequisite and continue with unrelated UI cases. At the end, return the report path, coverage counts, top five defects, and the exact release recommendation.
