# Org Engine × Octop Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` or `executing-plans` to implement this plan task-by-task. Steps use checkbox syntax for tracking. Do not commit or create a branch unless the user explicitly requests it.

**Goal:** 将 Org Engine 变成 Octop 之上的可恢复个人决策层，并证明本地或云端模型都能通过 Octop 安全使用联网搜索、生成可引用证据和完成真实用户流程。

**Architecture:** TS Fastify backend owns SQLite, durable executions, settings, task state, evidence and traces. Python remains a stateless decision/verification service and adapter boundary. Octop remains the only owner of model execution, search tools, HITL transport and trajectory; Org Engine owns policy, query privacy, confirmation and evidence projection.

**Tech Stack:** TypeScript, Fastify, `node:sqlite`, Vitest, Python 3.12, `unittest`, WebSocket, SSE, Octop HTTP API, local llama-server/OpenAI-compatible providers.

---

## File Map

**Modify:**

- `editor/backend-server/src/personal/migrations/001_personal.sql` and a new migration for execution/settings/search fields.
- `editor/backend-server/src/personal/store.ts` for atomic claims, execution records and idempotent writes.
- `editor/backend-server/src/personal/pipeline.routes.ts` for timeout units, job dispatch, recovery and duplicate-run behavior.
- `editor/backend-server/src/personal/protocol.ts` for search receipt/evidence mapping.
- `editor/backend-server/src/personal/confirmation.routes.ts` for shared canonical hashing and persisted tickets.
- `editor/backend-server/src/server.ts` for recovery startup and settings wiring.
- `engine/personal/envelopes.py`, `service.py`, `runner.py`, `permission_gate.py`, `protocols/octop.py` for network policy, search actions and verification.
- `engine/personal/adapters/octop_http.py` and `octop_ws.py` for agent preflight, HITL recovery and reliable SSE consumption.
- `editor/frontend/src/views/PersonalApp.tsx` and `PersonalOnboardingView.tsx` for real API flow and persisted settings.

**Create or extend tests:**

- `editor/backend-server/tests/personal-pipeline.test.ts`
- `editor/backend-server/tests/personal-execution-recovery.test.ts`
- `editor/backend-server/tests/personal-search-protocol.test.ts`
- `editor/frontend/src/views/PersonalApp.test.tsx`
- `engine/personal/search_policy_test.py`
- `engine/personal/service_test.py`
- `engine/personal/runner_test.py`
- `engine/personal/adapters/octop_ws_test.py`
- `manual-qa/2026-10-18/` for human-flow evidence only

## Task 0: Preserve the baseline and prepare the real environment

**Files:** no source changes; create only `manual-qa/2026-10-18/` outputs.

- [ ] **Step 1: Record the existing worktree.** Run `git status --short --branch` from `D:/claude-ecosystem/org-engine`. Do not clean untracked Octop files, temporary stores, screenshots or reports.
- [ ] **Step 2: Run the baseline tests.** Run `$env:PYTHONPATH='.'; python -m unittest personal.adapters.octop_ws_test personal.runner_test personal.service_test` from `D:/claude-ecosystem/org-engine/engine`; expected: `Ran 25 tests ... OK`.
- [ ] **Step 3: Run the editor tests.** Run `npm test` from `D:/claude-ecosystem/org-engine/editor`; expected: backend and frontend suites pass. Record failures without fixing unrelated tests.
- [ ] **Step 4: Check the three service health endpoints.** Start the exact commands in `editor/docs/integration/octop-live-spike.md:60-74` in separate terminals and check llama-server `:18080`, Octop `:8088`, and personal service `:5174`. Save JSON health responses under `manual-qa/2026-10-18/`.
- [ ] **Step 5: Stop here if Gate S prerequisites fail.** Do not begin UI work if Octop login, agent startup or a basic WS `done` frame cannot be observed.

## Task 1: Make the wire contract explicit before adding search

**Files:** modify `engine/personal/envelopes.py`, `editor/backend-server/src/personal/protocol.ts`; test in `engine/personal/service_test.py` and `editor/backend-server/tests/personal-search-protocol.test.ts`.

- [x] **Step 1: Add a versioned network policy shape.** Use this exact conceptual shape in both languages:

```json
{
  "enabled": false,
  "mode": "deny|ask|allow",
  "providers": ["searchfree_search"],
  "allowed_domains": [],
  "query_data_class": "public_only|redacted_local|private_forbidden",
  "max_results": 5,
  "recency": null
}
```

- [x] **Step 2: Add `network_policy` to `TaskEnvelope` and `PlanEnvelope`.** Preserve backward compatibility by defaulting to `enabled=false`, `mode=deny`, and reject unknown policy modes instead of silently enabling network access.
- [x] **Step 3: Add contract-version validation.** `/v1/execute` must reject a plan whose `contract_version` does not equal the execution envelope version; return a stable `contract_version_mismatch` error.
- [x] **Step 4: Add tests for defaults and mismatches.** Prove that an old task cannot inherit a newly enabled network policy and that malformed policy returns HTTP 400.
- [x] **Step 5: Run the focused tests.** Run `python -m unittest personal.service_test` and `npm run test:backend -- --run personal-search-protocol.test.ts` from their respective directories; expected: PASS.

## Task 2: Fix execution timing and transport reliability

**Files:** modify `editor/backend-server/src/personal/pipeline.routes.ts`, `engine/personal/adapters/octop_http.py`, `engine/personal/adapters/octop_ws.py`; test the same files' test suites.

- [x] **Step 1: Fix seconds versus milliseconds.** Change only the Python request field in `pipeline.routes.ts` from `timeout_s: 30 * 60_000` to `timeout_s: 30 * 60`; retain `callService(..., 35 * 60_000)`.
- [x] **Step 2: Add a regression test.** Mock `callService` and assert `/v1/execute` receives `1800`, not `18000000`; assert the outer fetch timeout remains `2100000` milliseconds.
- [x] **Step 3: Separate total deadline from SSE idle behavior.** Change `_sse_frame_getter` so a queue wait does not fail at 30 seconds while the HTTP SSE stream remains open. The total `timeout_s` remains the hard deadline; stream close/error remains terminal.
- [x] **Step 4: Remove the future `asyncio.run` trap.** Keep the synchronous public adapter for the current ThreadingHTTPServer, but add an async `run_turn_async` and make the sync wrapper run it in a dedicated thread when a loop is already running. Test both sync and running-loop callers.
- [x] **Step 5: Run `python -m unittest personal.adapters.octop_ws_test personal.runner_test personal.service_test`; expected: PASS with explicit timeout tests.

## Task 3: Implement explicit search policy and tool mapping

**Files:** modify `engine/personal/runner.py`, `engine/personal/service.py`, `engine/personal/envelopes.py`, `engine/personal/permission_gate.py`; create `engine/personal/search_policy.py` and `engine/personal/search_policy_test.py`.

- [x] **Step 1: Add a single search policy evaluator.** It must accept provider, query, URL/domain and local-data classification, and return `allow`, `needs_confirmation`, or `deny`. Do not copy search-provider implementations into Org Engine.
- [x] **Step 2: Map concrete Octop tools explicitly.** Use a table equivalent to:

```python
SEARCH_TOOLS = {
    "searchfree_search": ("web_search", "medium"),
    "tavily_search": ("web_search", "medium"),
    "brave_search": ("web_search", "medium"),
    "google_search": ("web_search", "medium"),
    "kimi_search": ("web_search", "medium"),
    "web_fetch": ("web_fetch", "medium"),
}
```

- [x] **Step 3: Keep search separate from file writes.** `write_file/edit_file` remain `draft`; `execute/send/delete/payment/submit` remain high-risk; `web_search` must never be normalized to `external_send` only because it is networked.
- [x] **Step 4: Sanitize arguments before gate evaluation.** Reject or redact local paths, file contents, secrets and raw private evidence in query strings. Record only a redacted query and hash in normal traces.
- [x] **Step 5: Add policy tests.** Cover public query allow, private-data deny, network disabled deny, unapproved provider deny, allowed domain allow, and user confirmation reject.
- [x] **Step 6: Run the focused Python tests; expected: PASS and no search tool falls through the unknown-tool high-risk branch.

## Task 4: Add SearchReceipt and citation evidence

**Files:** modify `engine/personal/protocols/octop.py`, `editor/backend-server/src/personal/protocol.ts`, `editor/backend-server/src/personal/store.ts`; add `engine/personal/search_receipts.py` and tests.

- [x] **Step 1: Define the receipt fields.** The minimum stable shape is:

```json
{
  "protocol_version": "octop-org-search-1",
  "event_id": "live:thread:call",
  "provider": "searchfree_search",
  "query_hash": "sha256:...",
  "query_redacted": "公开技术项目主页",
  "results": [{"url": "https://...", "title": "...", "snippet": "..."}],
  "captured_at": "2026-10-18T00:00:00Z",
  "request_hash": "sha256:...",
  "response_hash": "sha256:...",
  "external_data_decision": "allowed|confirmed|denied"
}
```

- [x] **Step 2: Preserve raw Octop payload separately.** The citation projection may redact content; the raw trajectory locator remains available to advanced diagnostics. Never hash a value on one side with a different canonical JSON algorithm on the other.
- [x] **Step 3: Add evidence kind or a schema version.** If the existing SQLite check constraint is kept, use `kind="tool_result"` plus `metadata_json` in a migration; do not write a new kind without updating the constraint and readers.
- [x] **Step 4: Add citation linkage.** Every final answer that claims external facts must reference one or more SearchReceipt IDs; missing source links result in `executed_unverified`, never `verified`.
- [ ] **Step 5: Add TS/Python golden-vector tests.** Use nested objects, Chinese text, arrays and reordered keys; assert identical content hashes.

## Task 5: Make executions durable and recoverable

**Files:** create a migration after `003_learning_versions.sql`; modify `store.ts`, `server.ts`, `pipeline.routes.ts`; tests in `personal-execution-recovery.test.ts`.

- [ ] **Step 1: Add an `executions` table.** Include `execution_id` primary key, `task_id` unique active key, `trace_id`, `contract_version`, `status`, `attempt`, `lease_owner`, `lease_until`, `heartbeat_at`, `octop_agent_id`, `octop_thread_id`, `last_error`, `created_at`, and `updated_at`.
- [ ] **Step 2: Add explicit statuses.** Use `queued`, `running`, `awaiting_confirmation`, `recoverable`, `interrupted`, `verified`, `failed`, `blocked`, `unverifiable`; do not overload task `planned` as a running job.
- [ ] **Step 3: Add atomic claim methods.** `claimExecution(taskId, expectedContractVersion, owner)` must be one transaction and return exactly one winner; a second caller receives the existing execution id.
- [ ] **Step 4: Add heartbeat and lease expiry.** Update heartbeat before and after calls to Python/Octop. On startup, scan expired `running` rows and use `hitl_pending`/history before creating a new thread.
- [ ] **Step 5: Make persistence idempotent.** Upsert receipt/evidence by `(execution_id, event_id)` and trace by execution id plus phase. A retry must not duplicate evidence or write a file a second time.
- [ ] **Step 6: Test crash recovery.** Simulate process restart after plan, after Octop thread creation, while HITL is pending, and after receipt persistence. Expected: one execution, no duplicate evidence, explicit recoverable state.

## Task 6: Unify confirmation tokens and restart recovery

**Files:** modify `editor/backend-server/src/personal/confirmation.routes.ts`, `engine/personal/permission_gate.py`, `pipeline.routes.ts`; add cross-language golden tests.

- [ ] **Step 1: Define canonical JSON once.** Use sorted object keys, compact separators, UTF-8, preserved array order, and explicit handling for null/booleans/numbers. Implement the same test vectors in TS and Python.
- [ ] **Step 2: Bind tokens to execution identity.** Include `task_id`, `execution_id`, `contract_version`, `action_id`, exact parameters hash and expiry. Do not accept a token for a later contract version.
- [ ] **Step 3: Persist or sign tickets.** A process-local Map/dict is insufficient for a desktop app that can restart. Persist ticket state in SQLite or use a signed short-lived token with server-side replay tracking.
- [ ] **Step 4: Make HITL resume a first-class route.** The UI should see `awaiting_confirmation`, fetch the exact action request, confirm it once, and resume the same Octop thread. No new `/run` should be created.
- [ ] **Step 5: Test changed args, replay, expiry, restart and cross-language hash equality.

## Task 7: Run the real Octop search Spike (Gate S)

**Files:** create `octop-playground/search_spike.py` or an equivalent existing script; store logs under `manual-qa/2026-10-18/search-spike/`.

- [ ] **Step 1: Configure a dedicated agent.** Ensure the created agent config contains `web_search_tools: ["searchfree_search"]`; reload/restart the agent and query its effective tool catalog through the Octop API.
- [ ] **Step 2: Run three public queries.** Use stable public subjects and record raw WS frames, not just the final text. Each run must include `tool_call_chunk`, `tool_result`, and a source URL.
- [ ] **Step 3: Run the same queries through `/v1/plan` and `/v1/execute`.** Confirm the Org Engine policy allows only the configured provider and produces SearchReceipt data.
- [ ] **Step 4: Test privacy.** Put a canary secret in a local file; ask a task that mentions the file. Assert the outbound search query and Octop action args do not contain the canary.
- [ ] **Step 5: Test four negative paths.** Disable network, disable search tool, reject user confirmation, and force provider failure. Expected statuses are distinct and none is `verified`.
- [ ] **Step 6: Declare Gate S.** Pass only when 3/3 searches have source evidence, privacy canary is absent, negative paths are correct, and the process restart test does not duplicate receipts. Otherwise choose deterministic pre-search or cloud-tool-calling fallback before more UI work.

## Task 8: Close the TS → Python → Octop API loop

**Files:** modify `pipeline.routes.ts`, `server.ts`, Python service; add `personal-pipeline.test.ts` and a manual E2E script.

- [ ] **Step 1: Validate configuration at startup.** Check personal service health, Octop health/login, agent config, effective workspace and effective search tools. Return a clear `not_ready` diagnostic instead of starting a task with stale settings.
- [ ] **Step 2: Replace the in-memory `void executeRun`.** Enqueue a durable execution and run a worker that updates lease/heartbeat. The HTTP route returns `202` with `execution_id` and current state.
- [ ] **Step 3: Add duplicate request behavior.** Two simultaneous `/run` calls for the same task/contract return the same `execution_id`; exactly one Octop thread receives the turn.
- [ ] **Step 4: Persist all results before terminal status.** Save receipts/evidence/trace, then atomically set verified/blocked/unverifiable. Never set a terminal state before evidence persistence succeeds.
- [ ] **Step 5: Add API tests with a fake Python service and fake Octop transport.** Cover plan blocked, awaiting confirmation, successful verified draft, search success with citations, provider error, timeout and recovery.

## Task 9: Connect onboarding and PersonalApp to real state

**Files:** modify `editor/frontend/src/views/PersonalOnboardingView.tsx`, `PersonalApp.tsx`, related API client/types; add/update frontend tests.

- [ ] **Step 1: Persist onboarding settings through the backend.** Save workspace, model/provider, privacy/network policy and permissions as a versioned personal settings record. `localStorage` may cache only the completion flag, not the source of truth.
- [ ] **Step 2: Replace `SAMPLE_OUTCOME`.** On “办一件事”, create a real task contract, call `/run`, and navigate to the task view with the returned task/execution id.
- [ ] **Step 3: Poll the task detail endpoint.** Render `queued/running/awaiting_confirmation/verified/blocked/unverifiable/recoverable`; display user-readable errors and a retry/resume action where allowed.
- [ ] **Step 4: Render real evidence and citations.** Read evidence/trace from the API; never use `trace_sample_01` or fixed privacy status for a live task.
- [ ] **Step 5: Add frontend tests.** Assert no sample outcome is rendered after a real response, confirmation resumes the same execution, errors are visible, and an onboarding cloud choice changes the backend settings payload.

## Task 10: Verify the user-facing search workflows manually

**Files:** create `manual-qa/2026-10-18/report.md`, screenshots and raw JSON only; do not modify unrelated source.

- [ ] **Step 1: Fresh onboarding.** Clear only the test profile/database, choose local model, set a test workspace, choose read-only, complete onboarding. Verify settings in the backend and Octop effective config.
- [ ] **Step 2: Public research task.** Ask for a short answer about a public topic. Verify the UI says that information will be sent to the allowed search provider, shows progress, and displays clickable sources.
- [ ] **Step 3: Local material plus research.** Ask to compare a local document with public information. Verify local content is not sent unless the policy explicitly allows it; verify both file evidence and search evidence are shown separately.
- [ ] **Step 4: Draft task.** Ask for a draft file. Verify read actions run, write pauses for HITL, reject leaves the original file unchanged, approve writes only inside the authorized workspace, and verifier checks the resulting hash.
- [ ] **Step 5: Failure tasks.** Turn off Octop, turn off search, reject network, interrupt the backend, and reload. Verify no false success, no lost task, no duplicate file, and a user-readable recovery state.
- [ ] **Step 6: Record acceptance.** A human tester must be able to explain what was sent externally, why an action paused, what file changed, and which source supports each external claim without reading code or logs.

## Task 11: Final verification and handoff

- [ ] **Step 1: Run focused Python tests.** `python -m unittest personal.adapters.octop_ws_test personal.runner_test personal.service_test personal.search_policy_test` from `engine`; expected: PASS.
- [ ] **Step 2: Run all editor tests.** `npm test` from `editor`; expected: PASS.
- [ ] **Step 3: Run the real Gate S and manual QA again from a clean test profile.** Do not treat mocks as a substitute.
- [ ] **Step 4: Check the diff.** Run `git diff --check` and inspect only files changed for this plan. Do not commit or create a branch.
- [ ] **Step 5: Update `org-engine-octop-integration-audit.md`.** Record actual Gate S result, known residual risks, exact provider configuration, and whether the fallback path was selected.
- [ ] **Step 6: Handoff only after evidence exists.** The execution model must receive the plan, baseline results, manual QA report, and the explicit CodeRabbit limitation; do not call the work complete based on unit tests alone.

## Exit Criteria

The integration is ready for the next product phase only when all are true:

- A real Qwen or configured cloud model has completed three Octop search turns.
- Org Engine policy can allow, confirm, redact or deny search independently from file writing.
- Search results produce stable, inspectable source evidence and citations.
- Duplicate `/run` calls, process restart, HITL pending and provider failure are recoverable and idempotent.
- UI no longer renders `SAMPLE_OUTCOME` or fake diagnostics.
- Onboarding settings alter actual backend/Octop behavior.
- Manual QA demonstrates the workflow as a human user would use it.
- All focused and full test suites pass, with unrelated historical failures listed separately.
