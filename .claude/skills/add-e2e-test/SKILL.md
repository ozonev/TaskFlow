---
name: add-e2e-test
description: Add a new Playwright E2E browser journey to tests/TaskFlow.E2ETests, reusing the existing harness and locator conventions, and — on any failure — gather trace/screenshot/network evidence and classify it (test/application/environment-startup/test-data-isolation/timing) before fixing the smallest correct layer. Use when asked to add, extend, or debug a TaskFlow E2E/browser test.
---

# Add an E2E test

This skill captures the workflow used to add `tests/TaskFlow.E2ETests/e2e/create-project.spec.ts`
and to triage its failure modes (commits `b0943ef` and `1102a6d7`). It adds **one** new browser
journey at a time to the existing Playwright suite. It does not create a second test harness, does
not touch CI/cloud/Jira, and does not edit application code to force a test green.

Write scope for this skill is strictly `tests/TaskFlow.E2ETests/**`. Read `src/**` freely (to verify
accessible names/behavior and, on an application defect, to cite where the bug lives) — never write
there.

## 0. Inputs

You need, from the requester or the conversation:
- The approved browser journey, as concrete user-visible steps (open X, click Y, fill Z, expect W).
- Acceptance criteria — the specific, checkable conditions the test must prove (e.g. "reload proves
  persistence", "no dev DB reused", "passes repeatedly with no hard-coded sleeps").

If either is missing or ambiguous, ask before writing anything — don't invent a journey or infer
criteria from the UI.

## 1. Inspect the existing harness before touching anything

Read, don't guess. `tests/TaskFlow.E2ETests/playwright.config.ts` already provides:

- An isolated SQLite file (`.tmp/e2e.db`) wiped by a **guarded top-level cleanup in the config file
  itself** — not `globalSetup`. Playwright's lifecycle is `runnerSetup → webServer → globalSetup →
  tests → globalTeardown → runnerTeardown`, so `globalSetup`/`globalTeardown` run at the wrong point
  to safely delete a file the API may already have open. The guard (`TEST_WORKER_INDEX ===
  undefined`) exists because the config module is re-imported in every worker process.
- `ASPNETCORE_ENVIRONMENT: 'Development'` on the API's `webServer` entry — required for **both**
  auto-migration-on-boot (`Program.cs` calls `Database.MigrateAsync()` before `app.Run()`) and CORS
  to `http://localhost:5273` (only wired when `IsDevelopment()`), via `ConnectionStrings__DefaultConnection`
  pointed at the isolated file (env vars override `appsettings.*.json`).
- Fixed ports: API `5274`, Web `5273` (Vite's `vite.config.ts` pins this; CORS is hardcoded to it too
  — if either port ever changes, both must change together).
- `reuseExistingServer: false` on both `webServer` entries — the suite always spawns its own
  processes and fails fast on a port conflict rather than silently attaching to a developer's
  already-running instance.
- `trace: 'retain-on-failure'`, `screenshot: 'only-on-failure'`, `video: 'retain-on-failure'`, and
  explicit `stdout: 'pipe'` / `stderr: 'pipe'` on both `webServer` entries. That last pair is not
  redundant: Playwright's default only pipes `stderr`, so routine startup/EF logs on `stdout` are
  silently dropped unless piped explicitly — confirmed by deliberately breaking startup and observing
  the gap.
- `retries: process.env.CI ? 2 : 0` — inert until a CI job actually runs this suite; don't treat its
  presence as evidence CI already retries anything.

Read the existing spec(s) under `e2e/` too, and reuse their idioms: `getByRole` with accessible name,
`.first()` to disambiguate an action that legitimately renders twice, unique test data via
`crypto.randomUUID()`, reload-based persistence checks.

**Never** create a second `playwright.config.ts`, a second `webServer` pair, or a parallel
DB-isolation mechanism. Extend the existing config only if the new journey genuinely needs something
the current one lacks — which a new page/route served by the same two servers almost never does.

## 2. Identify required test data and cleanup

- The harness resets the whole SQLite file once per **run**, not per test — a new spec doesn't need
  its own teardown.
- Because `fullyParallel: true`, more than one spec file can now share that one database within a
  single run. Don't assume "the list starts empty" the way `create-project.spec.ts` could when it was
  the only spec — give the new test its own uniquely-generated data and assert on that specific data,
  not on total counts or empty-state text that a sibling spec's data could invalidate.
- If the journey needs a specific pre-existing record (e.g. an update/delete flow), create it inside
  the test itself via the real UI/API flow — never seed the SQLite file directly or bypass the app.
- The projects list is ordered ascending by `CreatedAtUtc` with a fixed page size of 20
  (`DEFAULT_PAGE_SIZE` in `src/TaskFlow.Web/src/lib/constants.ts`; `page` — but not page size — is
  controllable via the `?page=` URL param, see `useProjects.ts`). A test that asserts a just-created
  row is visible without navigating is implicitly assuming the run's cumulative project count across
  **all** specs stays under 20 — true today with one spec, not guaranteed once more accumulate in the
  same run. Before adding a spec that could push the total over that line, either read the table's
  caption (`"{totalCount} project(s), page X of Y"`) and navigate to the last page, or otherwise avoid
  relying on page 1.

## 3. Plan before editing

Before writing the spec file, write out (in your response) the exact sequence of accessible locators
and assertions you intend to use, each one verified against the real source component — not assumed.
Confirm this sequence actually satisfies every acceptance criterion from step 0. This is a lightweight
design check, not a full plan-mode detour — but skipping it is exactly how a locator that doesn't
match the real accessible name gets introduced (the test-defect failure mode below).

## 4. Write the test

- Prefer `getByRole`/accessible-name locators exclusively. Add a `data-testid` or CSS selector only
  if the accessible surface genuinely can't distinguish the target, and say so in a comment.
- No `page.waitForTimeout` or other arbitrary sleeps, ever. Rely on Playwright's auto-waiting and
  `expect(...).toBeVisible()`/similar. If one specific operation is known to be slow for a real,
  explainable reason, give that one assertion an explicit longer timeout with a comment — never a
  blanket increase.
- Keep the file focused on one journey; add a new `test(...)` or a new spec file for a distinct
  journey rather than growing one test to cover unrelated behavior.

## 5. Run it: targeted first, then the full suite

```powershell
cd tests/TaskFlow.E2ETests
npx playwright test <new-spec-file>   # targeted — isolate the new journey first
npm test                              # full suite — catch cross-test interference
```

Both must pass before the work is done.

## 6. On any failure: gather evidence before touching anything

Don't guess from the error message alone. Playwright already attaches, on failure: a screenshot, a
video, an `error-context.md` accessibility snapshot, and a `trace.zip`. Pull concrete evidence from
each relevant source before deciding what's wrong:

- **`error-context.md`** — the accessibility tree at the moment of failure. Does the real element
  exist under a different name than the test expected?
- **Trace's network panel** (unzip `trace.zip` — its `*.network` file is JSONL — or `npm run report`
  → failed test → "View trace" → Network tab). Was the expected request even sent? What status code
  came back? A screenshot alone is not enough if the network log shows a 500; a timeout alone is not
  enough to blame timing if the network log shows the operation never started (or, conversely, shows
  it finished successfully just late).
- **Trace's console panel** — any browser-side JS errors?
- **The real source** (`src/TaskFlow.Web/...`) — cross-check whatever the evidence implies against
  the component that actually renders it.

Classify into exactly one of these, and **cite the specific artifact that proves it** — not just the
classification:

| Category | Signature |
|---|---|
| Test defect | The real element/behavior exists and matches source; the spec's locator/assertion just doesn't match it; zero or unrelated network activity. |
| Application defect | The network panel shows an error status (4xx/5xx) or a wrong body for a request that WAS sent correctly. |
| Environment/startup defect | Failure happens before any test/browser session exists — `webServer` never became ready; the (piped) `stdout`/`stderr` shows the real startup exception. |
| Test-data isolation defect | An assumption about starting DB state doesn't hold — a `GET` response body shows an unexpected `totalCount`/rows; usually means the harness's pre-run cleanup was bypassed or a co-running spec collided. |
| Timing / missing observable state | The underlying operation actually succeeds (check server logs / eventual network status) but later than the assertion's timeout — a slow result, not a wrong one. |

## 7. Fix the smallest correct layer

- **Test defect** → fix the spec only.
- **Environment/startup or test-data isolation defect** → fix `playwright.config.ts` only, never the
  spec's assertions or the app.
- **Timing** → prefer a targeted, explained timeout/wait on the specific slow assertion over a
  blanket increase; never paper over it with retries alone.
- **Application defect** → **do not modify anything under `src/`.** This skill's write scope is
  `tests/TaskFlow.E2ETests/**` only. Report the defect (evidence + suspected location) back to the
  requester as a finding; fixing application code is a separate, explicit decision outside this
  skill.
- Never weaken an assertion (broaden a locator, drop a check, loosen a text match) just to make a
  failing test pass — that hides a real signal instead of resolving it.

## 8. Re-verify

Rerun the fixed test, then the full suite (step 5 again). Confirm via `git diff`/`git status` that
only the intended files changed, `src/**` is untouched (unless step 7 explicitly surfaced an
application defect and you were separately, explicitly asked to fix it), and no sleep/arbitrary wait
was introduced anywhere in the diff.

## 9. Report back

- Changed files (path + one-line purpose each).
- Exact commands run (targeted test, full suite, any evidence-gathering commands).
- Evidence gathered for any failure encountered, with its classification and citation.
- Remaining risk or follow-ups (e.g. "this journey isn't wired into CI yet", "isolation assumption X
  now depends on test order").

Never stage or commit — this repo requires explicit human go-ahead for every commit (root
`CLAUDE.md`).

## Out of scope

- No cloud/Azure deployment, no CI workflow changes (`.github/workflows/**`), no Jira/Confluence —
  those are separate concerns from adding a browser test.
- No modifying production data or any application code outside `tests/TaskFlow.E2ETests`.
- No rewriting the UI or loosening a test to force a pass.
- No hiding flakiness behind added retries or inflated timeouts without an evidenced, explained
  reason.
- No restating generic Playwright documentation (locator API, config reference) — this file only
  holds what's specific to this repo's harness.
