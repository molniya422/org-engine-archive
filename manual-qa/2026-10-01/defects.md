# Acceptance Defects

## OE-MAN-001

ID: OE-MAN-001
Severity: P1
Area: Export
Environment: dev browser
Precondition: A valid organization is open in Studio and the export menu is visible.
Steps to reproduce:
1. Open Studio for the QA organization.
2. Open Export.
3. Choose Download YAML or Download JSON.
4. Wait for the browser download event.
Expected: A UTF-8 YAML or JSON file is downloaded and can be opened from the QA exports directory.
Actual: The visible export menu opens, but the browser emits no download event within five seconds.
Evidence: `manual-qa\2026-10-01\screenshots\EXP-02.png`; `manual-qa\2026-10-01\blackbox-results.md`
Frequency: always in this run
Data left behind: No UI export file was created.
Workaround: The MCP/API export path returned organization content, but this is not a user-facing browser workaround.

## OE-MAN-002

ID: OE-MAN-002
Severity: P1
Area: Run
Environment: dev browser and runtime API
Precondition: Runtime readiness reports the adapter available and a valid organization is selected.
Steps to reproduce:
1. Open Studio > Run.
2. Enter a normal task.
3. Click Start Run.
4. Wait for navigation to the run monitor.
Expected: A run ID is created and the monitor opens with queued/running state.
Actual: The button remains in `Starting...`; navigation never occurs. The backend state later showed `blocked` with no gateway and no events. A direct POST to `/api/v1/runs` also timed out.
Evidence: `manual-qa\2026-10-01\screenshots\RUN-01.png`; `manual-qa\2026-10-01\blackbox-results.md`
Frequency: always in this run
Data left behind: A blocked QA run state; no usable monitor session.
Workaround: None for a real run. Read-only UI and MCP operations remain usable.

## OE-MAN-003

ID: OE-MAN-003
Severity: P1
Area: Bridge
Environment: CLI / disposable Windows configuration
Precondition: Empty disposable Claude configuration and repository bridge installer.
Steps to reproduce:
1. Set `CLAUDE_CONFIG_DIR` to the disposable QA directory.
2. Run `bridge\install.ps1`.
3. Inspect the target harness directory.
Expected: The installer copies the harness scripts and reports a usable installation.
Actual: The installer exits with code 0, but copies zero harness files because it resolves the source as `bridge\harness`; the actual harness is under `engine\harness`. The success message is therefore false.
Evidence: `bridge\install.ps1`; disposable target under `manual-qa\2026-10-01\bridge-config`
Frequency: always for the tested source layout
Data left behind: Disposable QA configuration only.
Workaround: Manually copy the required harness from `engine\harness` and do not trust the installer success message.

## OE-MAN-004

ID: OE-MAN-004
Severity: P2 / environment blocker
Area: Electron
Environment: packaged Electron launch on this Windows environment
Precondition: Electron build completed.
Steps to reproduce:
1. Launch the packaged Electron target.
2. Observe process output and exit status.
Expected: The application window opens and shows the home view.
Actual: Electron exits with code 1 and reports `crashpad_client_win.cc(868)] not connected`.
Evidence: Test session output; `DESKTOP-02` through `DESKTOP-05` are blocked.
Frequency: always in this environment
Data left behind: No persistent product data.
Workaround: Run the browser development build; packaged desktop behavior remains unverified.

## OE-MAN-005

ID: OE-MAN-005
Severity: P2
Area: Engine
Environment: preflight build
Precondition: Full editor build requested.
Steps to reproduce:
1. Run the backend and frontend TypeScript build gates.
Expected: Both typecheck/build gates pass.
Actual: Backend reports missing proposal fields `reverted_commit` and `auto_applied`; frontend reports a spread-type error in `EvolutionPanel.test.tsx`.
Evidence: `environment.md`; source locations `editor\backend-server\src\learning\routes.ts` and `editor\frontend\src\components\EvolutionPanel.test.tsx`.
Frequency: observed in this run
Data left behind: No product data.
Workaround: Electron-only build passed, but the full editor build cannot be accepted.
