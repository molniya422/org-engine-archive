# Human Acceptance Case Results

Legend: `PASS` means the stated scope was observed; `FAIL` means the user flow reproduced a defect; `BLOCKED` means a prerequisite or missing session prevented execution; `NOT DISCOVERABLE` means the feature was not reachable through the normal visible UI. `Supplemental E2E` is automated browser evidence, not a replacement for manual acceptance.

| ID | Status | Evidence / scope note |
|---|---|---|
| SM-01 | PASS | Manual browser shell; `screenshots\SM-01-home.png` |
| SM-02 | PASS | Manual visible navigation; `screenshots\SM-02-navigation.png` |
| SM-03 | PASS | Manual theme toggle; `screenshots\SM-03-dark.png` |
| SM-04 | PASS | Manual health page; `screenshots\SM-04-health.png` |
| ORG-01 | PASS | Manual create/open; `screenshots\ORG-01-studio.png` |
| ORG-02 | BLOCKED | Invalid-input path not completed in this run |
| ORG-03 | PASS | Supplemental E2E Chinese-name creation; full reopen/export not completed |
| ORG-04 | PASS | Manual role editor/tree entry; `screenshots\ORG-04-role-editor.png` |
| ORG-05 | BLOCKED | Department/role mutation path not completed |
| ORG-06 | BLOCKED | Skill add/remove path not completed |
| ORG-07 | BLOCKED | Duplicate identifier path not completed |
| ORG-08 | BLOCKED | Full tab persistence matrix not completed |
| WF-01 | PASS | Manual canvas entry; `screenshots\WF-01-canvas.png` |
| WF-02 | PASS | Supplemental E2E node palette/draggable controls |
| WF-03 | PASS | Supplemental E2E generated-agent properties edit |
| WF-04 | PASS | Supplemental E2E message-edge mode; both edge persistence paths not completed |
| WF-05 | BLOCKED | Undo/redo/layout/delete/clear matrix not completed |
| WF-06 | BLOCKED | Workflow save/reload not completed |
| WF-07 | PASS | Supplemental E2E role binding check |
| WF-08 | BLOCKED | Validation/cycle behavior not completed |
| WF-09 | BLOCKED | Draft workflow behavior not completed |
| PB-01 | PASS | Manual category/filter navigation; `screenshots\PB-01-playbooks.png` |
| PB-02 | BLOCKED | Detail inspection not completed |
| PB-03 | BLOCKED | Required-parameter error path not completed |
| PB-04 | BLOCKED | Three apply modes not completed |
| SK-01 | PASS | Manual Skills/Schema views; `screenshots\SK-01-skills-schema.png` |
| SK-02 | PASS | Supplemental E2E rescan control |
| SK-03 | BLOCKED | Extra directory scan not completed |
| SK-04 | BLOCKED | Invalid/missing path scan not completed |
| SK-05 | BLOCKED | Persisted scan path not completed |
| SK-06 | PASS | Manual Schema tab entry |
| RUN-00 | PASS | Manual runtime panel/readiness; `screenshots\RUN-00-run-panel.png` |
| RUN-01 | FAIL | Start remains Starting; `screenshots\RUN-01.png`; OE-MAN-002 |
| RUN-02 | BLOCKED | RUN-01 never opened monitor |
| RUN-03 | BLOCKED | No live run/gateway |
| RUN-04 | BLOCKED | No live run/gateway |
| RUN-05 | BLOCKED | No completed run |
| RUN-06 | BLOCKED | No cancellable live run |
| RUN-07 | BLOCKED | No persisted monitor session |
| RUN-08 | BLOCKED | Runtime failure recovery path not independently completed |
| GOV-01 | PASS | Empty governance states reachable; populated meeting state blocked |
| GOV-02 | BLOCKED | Empty state reachable; populated audit requires completed run |
| GOV-03 | BLOCKED | Empty state reachable; product registry requires completed run |
| GOV-04 | BLOCKED | Cross-page consistency requires completed run |
| LEARN-01 | BLOCKED | Empty-state refresh not manually completed |
| LEARN-02 | BLOCKED | Reject path not manually completed |
| LEARN-03 | PASS | Supplemental E2E approval mutates org and records commit |
| LEARN-04 | BLOCKED | Revert path not manually completed; build type issue remains |
| LEARN-05 | BLOCKED | Invalid transition path not completed |
| LEARN-06 | PASS | Supplemental E2E low-risk L3 auto-apply; breaker not exercised |
| EXP-01 | BLOCKED | Export menu passed; actual YAML download not completed |
| EXP-02 | FAIL | Download event timed out; `screenshots\EXP-02.png`; OE-MAN-001 |
| EXP-03 | BLOCKED | Backend-down export recovery not completed |
| MCP-01 | PASS | Install-info integration endpoint returned config; visible help path not confirmed |
| MCP-02 | PASS | Real stdio MCP SDK client initialized and listed tools; `mcp-results.json` |
| MCP-03 | PASS | 5 read-only tools passed; run/cancel lifecycle blocked; `mcp-results.json` |
| DESKTOP-01 | PASS | `npm run build:electron` passed |
| DESKTOP-02 | BLOCKED | Packaged launch exits with Crashpad error; OE-MAN-004 |
| DESKTOP-03 | BLOCKED | Depends on packaged launch |
| DESKTOP-04 | BLOCKED | Depends on packaged launch |
| DESKTOP-05 | BLOCKED | Depends on packaged launch |
| BRIDGE-01 | FAIL | Fresh install false-success/missing harness; OE-MAN-003 |
| BRIDGE-02 | BLOCKED | Fresh install prerequisite failed |
| BRIDGE-03 | BLOCKED | Fresh install prerequisite failed |
| BRIDGE-04 | BLOCKED | Fresh install prerequisite failed |

## Coverage counts

- PASS: 24
- FAIL: 3
- BLOCKED: 38
- NOT DISCOVERABLE: 0
- Total planned cases: 65

The PASS count includes supplemental E2E and partial-scope rows only where the evidence note states the limitation. The three failures are the browser export, real run, and bridge installer findings.
