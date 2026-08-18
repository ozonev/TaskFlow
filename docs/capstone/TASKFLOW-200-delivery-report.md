# TASKFLOW-9 Delivery Report

> Filed under `TASKFLOW-200` per the capstone course's fixed report-naming convention; the ticket implemented is **TASKFLOW-9**.

**Ticket:** [TASKFLOW-9 — Add project labels and task filtering](https://taskflowtest.atlassian.net/browse/TASKFLOW-9)
**Branch:** `Module17`
**Final commits:** `1750589` (feature), `4f72596` (fix), `3b78438` (test fix) — see [Commits](#commits)

## Approved scope

**User story:** As a project user, I want to label tasks and filter tasks by label and status, so that I can organize project work more easily.

**Out of scope (from ticket comments):** global labels shared across projects, label permissions, bulk assignment, real-time updates, production deployment.

**Required verification (from ticket comments):**
- Duplicate label names in one project are rejected
- A label from another project cannot be assigned
- Status-only, label-only, and combined filters behave predictably
- Frontend loading, empty, validation, and error states remain usable
- The Playwright journey creates a project/label/task, assigns the label, filters, and reloads
- SQLite/preview data survives a container restart check
- The deployed image tag maps to the reviewed commit
- Cleanup leaves no unexpected cost-bearing resource

## Flagged mismatch, resolved

The ticket's "SQLite data survives the preview container restart check" doesn't match this repo's actual architecture: `docs/architecture/preview-environment.md` documents that SQLite-on-preview was tried and abandoned (`CrashLoopBackOff` over Azure Files SMB) — preview runs PostgreSQL Flexible Server. Reinterpreted as **"Postgres data survives a Container App restart/redeploy"** — verified twice: the `AddLabels` migration applied cleanly on the initial deploy, and again unchanged on the follow-up image-tag-only redeploy (see [Migration](#migration) and [Preview deployment](#preview-deployment)).

## Assumptions (no existing precedent in the codebase)

1. **Cardinality:** a task can carry multiple labels (many-to-many); the filter is single-select, matching the pre-existing mocked filter control's shape.
2. **Duplicate-name / cross-project rejection:** both surfaced as 400 `ValidationProblemDetails` (via `ModelState.AddModelError` + `ValidationProblem`), not 409 — reuses the frontend's existing field-error rendering with no new UI code.
3. **No unassign/remove-label endpoint** — not required by the AC or verification list.
4. **Label management surface:** a new "Manage labels" modal route, opened from the task list header; label assignment happens in the task drawer (mirrors how comments are added after task creation).
5. **Re-assigning an already-assigned label is idempotent** (200, no-op).

## Implementation summary

Full-stack vertical slice — no label support existed anywhere in the repo before this ticket; the frontend previously shipped only a disabled placeholder (`PlannedLabelFilter.tsx`, now deleted) explicitly marked "mocked until the capstone."

**Backend** (Domain → Application → Infrastructure → Api, per this repo's layering):
- `Label` and `TaskLabel` (join) domain entities; `AuditEventType` extended with `LabelCreated`/`TaskLabelAssigned`
- `ILabelRepository`, `ITaskLabelRepository`; `TaskSearchFilter` extended with `LabelId` (default-valued, so no existing call site needed updating)
- `CreateLabelHandler`, `ListLabelsHandler`, `AssignTaskLabelHandler`; `TaskDto` extended with `Labels`, threaded through `CreateTaskHandler`/`GetTaskByIdHandler`/`SearchTasksHandler`
- `LabelConfiguration`/`TaskLabelConfiguration` (unique index on `(ProjectId, Name)`; index on `LabelId` for the filter join); `TaskRepository.ApplyFilter` extended with a correlated-subquery label predicate
- `LabelsController` (`POST`/`GET /api/projects/{projectId}/labels`), `TaskLabelsController` (`POST /api/tasks/{taskId}/labels`); `TaskSearchController`/`SearchTasksRequest`/`TaskResponse` extended for label filtering and label chips on tasks
- `ConcurrentWriteConflictException` — a new Application-layer abstraction Infrastructure's `UnitOfWork` throws (translated from EF Core's `DbUpdateException`) so Application handlers can react to a lost race without taking an EF Core dependency; used by both `CreateLabelHandler` and `AssignTaskLabelHandler` to keep their duplicate-name/idempotent-assign guarantees correct under genuine concurrency (see [Review findings](#review-findings-and-resolutions))

**Frontend:**
- `LabelFilter.tsx` (replaces `PlannedLabelFilter.tsx`) — single-select `Select` sourced from `useLabels(projectId)`
- `ManageLabelsDialog.tsx` (new route `/projects/:projectId/labels`) — list + create form, mirrors `CreateProjectDialog`'s pattern
- `TaskDrawer.tsx` — new "Labels" section: assigned labels as `Tag`s + an "Add a label" select scoped to not-yet-assigned project labels, with inline error surfacing on a failed assignment
- `TaskRow.tsx`/`ActiveFilterChips.tsx` — label chips on rows and in the active-filter summary
- `useTaskFilters.ts`/`useTaskSearch.ts` — `?label=` query param, folded into `hasActiveFilters`/`clearAll`
- Mock layer (`store.ts`/`seed.ts`/`createMockClient.ts`) kept at parity with the real API (same idempotent-reassign, cross-project-400, case-insensitive-duplicate-400 behavior), enforced by this repo's existing `fixtureIsolation.test.ts`/ESLint rule

## Migration

`AddLabels`, generated for both providers per `.claude/rules/ef-core.md`:
- SQLite: `20260818131714_AddLabels`
- Postgres: `20260818131733_AddLabels`

Applied to the local SQLite dev database via `dotnet ef database update`. Confirmed applying cleanly against a real PostgreSQL container via the `Category=Postgres` test suite, and again on the live preview deployment (see [Preview deployment](#preview-deployment)).

## Commands and tests actually run

**Backend:**
```
dotnet build
dotnet test --filter-not-trait "Category=Postgres"   # 215 passed
dotnet test --filter-trait "Category=Postgres"       # 2 passed (ConcurrentProjectCreationTests, ConcurrentDuplicateLabelNameTests)
dotnet ef migrations add AddLabels --project src/TaskFlow.Infrastructure --startup-project src/TaskFlow.Api
dotnet ef migrations add AddLabels --project src/TaskFlow.Infrastructure.Migrations.Postgres --startup-project src/TaskFlow.Api   # DatabaseProvider=Postgres
dotnet ef database update --project src/TaskFlow.Infrastructure --startup-project src/TaskFlow.Api
```

**Frontend** (`src/TaskFlow.Web`):
```
npm run build   # tsc -b && vite build
npm test -- --run   # 211 passed
npm run lint    # eslint . — clean
```

**E2E** (`tests/TaskFlow.E2ETests`):
```
npx playwright test label-filter.spec.ts   # targeted
npm test                                    # full local suite, 3 passed
PREVIEW_BASE_URL=<container-app-fqdn> npx playwright test --grep "@preview-smoke"   # 3 passed against live preview
```

**Manual smoke** (via `run-taskflow`'s AppHost path, real Postgres): created two projects, two labels, a task; assigned a label; verified label-only and status+label combined search filters; confirmed cross-project assignment returns 400 with the exact expected error; confirmed duplicate-name create returns 400 with the exact expected error. All matched the designed contract exactly.

## Review findings and resolutions

Two independent review passes: the `dotnet-reviewer` subagent, and a separately-invoked `/code-review` (forked, adversarial). Combined findings and outcomes:

| Finding | Severity | Resolution |
|---|---|---|
| `CreateLabelHandler`'s duplicate-name check has a TOCTOU race (concurrent identical-name creates could both pass the pre-check, one would 500 instead of 400) | High (flagged independently by both reviews) | **Fixed.** Required a new `ConcurrentWriteConflictException` abstraction (Application-layer) that `UnitOfWork.ExecuteInTransactionAsync` throws in place of a leaked `DbUpdateException` — this correctly rolls back and disposes the transaction *before* the handler's recovery re-query, avoiding a genuine Postgres "aborted transaction" failure mode a naive same-transaction catch would have hit. **Proven against a real Postgres container**, not just reasoned about: `ConcurrentDuplicateLabelNameTests` fires 20 concurrent identical-name creates and asserts exactly one 201, the rest clean 400s, no 500s, one row persisted. |
| `TaskLabelRepository.AssignAsync`'s doc comment claimed idempotency the implementation didn't provide (same race as above) | High | **Fixed** — same `ConcurrentWriteConflictException` pattern applied to `AssignTaskLabelHandler`. |
| `ManageLabelsDialog` and the TaskDrawer's label-assignment control had no tests | Medium | **Fixed** — added `ManageLabelsDialog.test.tsx` (create/duplicate/empty/axe) and a `labels` describe block in `TaskDrawer.test.tsx` (assignment interaction + already-assigned-labels excluded from options). |
| `ActivityPanel`'s `EVENT_LABELS` map was missing `LabelCreated`/`TaskLabelAssigned` | Low | **Fixed** — two-line addition. |
| `TaskDrawer`'s assign-label mutation discarded its error (`void assignLabel.run(...)`) with no user feedback on failure | Low | **Fixed** — added an inline `role="alert"` message on `assignLabel.error`. |
| `AssignTaskLabelRequest.LabelId` (non-nullable `Guid`) let an omitted `labelId` silently bind to `Guid.Empty`, producing a misleading 404 instead of 400 | Low | **Fixed** — changed to `Guid?` with `[Required]`; added `Post_WithoutLabelId_Returns400`. |
| Duplicated `ToLabelDto` mapper across three handlers | Low (cosmetic) | **Fixed** — extracted `LabelDto.FromDomain`. |
| `CreateLabelHandler`'s duplicate-name check backstop had no exception translation (Medium, from the first review, before the fix above existed) | Medium | Superseded by the High-severity fix above once both reviews converged on the same underlying race. |

All fixes verified: 215 backend tests (SQLite) + 2 Postgres-tagged tests + 211 frontend tests + lint, all green after every fix.

## Playwright result and artifact location

- Local full suite: 3/3 passed (`tests/TaskFlow.E2ETests`, HTML report at `tests/TaskFlow.E2ETests/playwright-report/`)
- Tagged `@preview-smoke` run against the live deployed container: 3/3 passed (`create-project.spec.ts`, `preview-smoke.spec.ts`, the new `label-filter.spec.ts`)
- New journey: `tests/TaskFlow.E2ETests/e2e/label-filter.spec.ts` — creates a project, a task, and a label (via the Manage labels dialog), assigns the label from the task drawer, filters the task list by it, and reloads to prove persistence through the real backend

## Image tag and preview URL

- **Image:** `acrtaskflowpreviewptu3x.azurecr.io/taskflow-api:4f72596471dd37791a3c5872248726d41f149e13` (the fix commit — see [Preview deployment](#preview-deployment) for why the tag isn't the feature commit itself)
- **Preview URL:** `https://ca-taskflow-api-preview.ambitioushill-927f313d.northeurope.azurecontainerapps.io` — **destroyed** after smoke testing completed (see [Cleanup](#cleanup-result-and-owner)); the URL no longer resolves to anything.

### Preview deployment

Deployed via `/deploy-preview-env` against a freshly-provisioned platform (`rg-taskflow-preview`, `northeurope`, subscription `ad925f8c-465f-45b4-9632-f6286e0f30e4`). Budget alert created ($20/month, 90% threshold, scoped to the resource group) via `az rest` against the Cost Management Budgets API directly, after `az consumption budget create` proved incompatible with this environment's installed CLI version.

The first image build/deploy (commit `1750589`, the reviewed feature commit) revealed a **pre-existing defect unrelated to TASKFLOW-9**: the app's `Program.cs` never called `app.UseRouting()` explicitly, so ASP.NET Core's minimal-hosting-model implicit routing insertion caused `MapFallbackToFile`'s SPA-fallback endpoint to match every non-API request — including real static assets — before `UseStaticFiles` got a chance to serve them (`StaticFileMiddleware` silently self-skips once an endpoint is already matched). The browser always received `index.html`'s body instead of the real JS/CSS bundle, rendering a blank page. Confirmed via `docker run` locally against the exact pushed image (reproducible outside Azure entirely) and via verbose ASP.NET Core diagnostic logging (`Static files was skipped as the request already matched an endpoint.`). Never caught before because local dev never exercises `wwwroot`, and this deploy skill's own post-deploy check only polls `/health` and `GET /api/projects` — never loads the SPA in a browser.

Fixed with one line (`app.UseRouting();` placed after `UseStaticFiles`/`UseDefaultFiles`, before the `Map*` calls), committed separately (`4f72596`), rebuilt, and redeployed as an in-place image-tag update (0 added, 1 changed, 0 destroyed). Verified fixed both locally (`docker run` against the new image) and on the redeployed preview before rerunning the smoke suite.

## Known limitations

- No label unassign/remove/rename/delete — out of scope per the ticket; a task's label set can only grow via the current UI.
- `CreateLabelHandler`'s duplicate-name uniqueness is exact-case at the DB level (the unique index), while the application-level pre-check is case-insensitive — a race between two concurrent inserts differing only in case is now handled correctly (proven against real Postgres), but this is the same class of race this codebase already tolerates for Project names.
- The pre-existing static-file-serving bug (fixed in `4f72596`) had presumably been latent since `MapFallbackToFile` was first introduced for this repo's SPA hosting — this delivery is the first time a real browser-based smoke test ran against an actual container deployment, so it's plausible (though unconfirmed) that no prior preview deployment ever rendered a working UI either.
- Manual smoke testing and the concurrency test used the AppHost/Postgres-container path and a real preview Postgres server respectively — no additional persistence testing beyond what's described above.

## PR-ready summary

**TASKFLOW-9 — Add project labels and task filtering.** Adds a `Label` entity scoped per project, a many-to-many Task↔Label relationship, single-select label filtering combined with the existing status filter, a "Manage labels" dialog, and label assignment from the task drawer. Includes EF Core migrations for both SQLite and Postgres. Duplicate label names and cross-project label assignment are rejected as 400s reusing the existing validation-error UI path; both are proven race-safe under genuine concurrent load against a real Postgres container. A new Playwright journey covers create → label → assign → filter → reload, verified both locally and against a live preview deployment. Along the way, fixed a pre-existing, unrelated static-file-serving defect discovered during that preview verification (separate commit).

Suggested commit sequence (already applied, in this branch):
1. `feat: add project labels and task filtering` (`1750589`)
2. `fix: static files skipped when SPA fallback matches first` (`4f72596`)
3. `test: disambiguate label-assignment locator in label-filter E2E spec` (`3b78438`)
4. `docs: add TASKFLOW-200 delivery report` (this file)

## Cleanup result and owner

Preview environment fully destroyed: `terraform destroy` applied cleanly for both `infra/preview/application` (1 destroyed) and `infra/preview/platform` (11 destroyed), in that order, each behind its own explicit approval. Verified via `az group show`/`az resource list` (the Azure MCP plugin's own check failed with a tenant-credential mismatch and was not used as the answer): `rg-taskflow-preview` returns `ResourceGroupNotFound` — the resource group and everything in it is gone. No cost-bearing resource remains.

**Owner:** vitalii.ilchenko@nixs.com
