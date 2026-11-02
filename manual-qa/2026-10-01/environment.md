# Org Engine Human Acceptance Test Environment

Date: 2026-10-01
OS shell: Windows PowerShell 5.1.26100.4652
Node: v24.15.0
npm: 11.12.1
Python: 3.12.1
Chromium: D:\Chromium\Application\chrome.exe
Commit: 5ed7576 (master)

## Isolated paths

- QA root: `D:\claude-ecosystem\org-engine\manual-qa\2026-10-01`
- ORG_ENGINE_HOME: `manual-qa\2026-10-01\home`
- ORG_ENGINE_LEARNING_DIR: `manual-qa\2026-10-01\learning`
- Backend: `http://127.0.0.1:15172`
- Frontend: `http://127.0.0.1:15173`
- MCP daemon used by probe: `http://127.0.0.1:15174`
- Browser evidence: `manual-qa\2026-10-01\screenshots`

## Launch

Backend was launched from `editor` with the isolated home and learning variables and `PORT=15172`.
Frontend was launched from `editor\frontend` with `VITE_PROXY_TARGET=http://localhost:15172` on port `15173`.
The real MCP probe used the bundled stdio server and a real MCP SDK client.

## Preflight

- `editor\dist\orchestrator-adapter.exe`: present.
- Electron TypeScript build: passed with `npm run build:electron`.
- Full backend TypeScript build: failed on existing proposal fields `reverted_commit` and `auto_applied`.
- Full frontend TypeScript build: failed in `EvolutionPanel.test.tsx` on a spread-type error.
- Engine learning tests: 21 passed.
- Backend tests: 75 passed.
- Frontend tests: 11 passed.

## Scope note

The primary black-box browser run executed visible UI actions for 14 cases. Existing browser E2E supplied supplemental evidence for 30 cases. The remaining plan cases are explicitly marked `BLOCKED` or `NOT DISCOVERABLE` in `case-results.md`; they were not silently counted as passes.
