# Org Engine Human Acceptance Test Summary

Date: 2026-10-01
Recommendation: **hold for P1 fixes**

## Results

- Primary visible browser actions: 14 cases exercised; 12 passed and 2 failed.
- Supplemental browser E2E: 30 cases passed with the corrected isolated learning/runtime configuration.
- MCP: real stdio MCP client connected; 9 tools were listed. `list_orgs`, `get_org`, `export_org`, `validate_org`, and `list_skills` passed. Run start/cancel remained blocked by the runtime failure.
- Electron: `build:electron` passed, but packaged launch exited with the Crashpad error, so desktop flows are blocked.
- Bridge: installer returned success while installing zero harness files; this is a confirmed installer defect.

## Answers to acceptance questions

- Can a new user launch and understand the product? **Yes in the browser development shell; packaged Electron is blocked.**
- Can the user create, edit, validate, save, export, and reopen an organization? **Creation, Studio entry, validation/read-only views, and export menu are visible; actual browser download failed, and the complete lifecycle was not accepted.**
- Can the user build, validate, save, and reload a workflow with all six node types and both edge kinds? **Canvas entry and node/edge controls are visible; full drag, save, reload, and repair acceptance was not completed.**
- Can the user run a real task, answer all three gateways, observe events, reconnect, and cancel? **No. Run creation is blocked before the monitor opens.**
- Are meetings, communication audits, product keys, learning proposals, and reverts trustworthy and consistent? **Empty governance states and selected learning UI paths were reachable, but no completed real run was available for cross-page consistency; full trust acceptance is blocked.**
- Does MCP work through a real MCP client? **Partially. Initialization, tools/list, and read-only tools passed; run lifecycle tools are blocked.**
- Does the packaged Electron app work without a terminal? **Not verified; launch fails in this environment.**
- Does the bridge install safely preserve existing configuration? **No. Fresh installation is unusable and falsely reports success.**

## Top blockers

1. `OE-MAN-002`: real run cannot leave Starting state.
2. `OE-MAN-001`: browser YAML/JSON download does not occur.
3. `OE-MAN-003`: bridge installer copies from the wrong source directory and reports false success.
4. `OE-MAN-004`: packaged Electron launch fails with Crashpad error in this environment.
5. `OE-MAN-005`: full backend/frontend build gates fail on existing type errors.

## Important limitation

This report distinguishes human-style browser evidence from supplemental automated E2E and direct MCP integration evidence. Cases not completed after the critical runtime blockers are listed explicitly in `case-results.md`; they are not represented as passes.
The plan's final responsive/accessibility/hostile-input pass was not completed and requires a follow-up run after the P1 blockers are resolved.
