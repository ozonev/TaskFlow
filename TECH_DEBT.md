# Technical Debt

Known issues identified during code review that were deliberately deferred rather than fixed immediately. Each item lists where it was found, why it matters, and what would trigger fixing it. Remove an entry once it's resolved (a link to the fixing commit/PR in the removal commit message is enough — no need to keep a "done" section here).

## Open items

### 1. `AuditLogs` rows not cleared in shared-fixture tests

- **Where:** `tests/TaskFlow.Tests/Api/GetCommentsEndpointTests.cs:20` and other classes in `CommentsApiCollection`/`TasksApiCollection`
- **Found:** 2026-08-11, review of `82dca9b` (audit logging) / `480c6fc`
- **Issue:** `GetCommentsEndpointTests`, `CreateCommentEndpointTests`, `CommentPersistenceTests` (`CommentsApiCollection`), and `CreateTaskEndpointTests` (`TasksApiCollection`) trigger handlers that now write `AuditLog` rows, but none of their `InitializeAsync` methods clean the `AuditLogs` table (only `Comments`/`Tasks`/`Projects` are cleared). This violates the project's own rule (CLAUDE.md, Testing section) that fixture-sharing test classes must clean their table's rows in `InitializeAsync`.
- **Risk if left:** Audit rows accumulate unbounded across test runs in the shared host; tests can start observing each other's audit rows, causing flaky/incorrect assertions as more audit-writing tests are added.
- **Fix:** Add `AuditLogs` row deletion to each affected class's `InitializeAsync`.

### 2. Audit-log read endpoints are unpaged

- **Where:** `src/TaskFlow.Application/AuditLogs/GetTaskAuditLogHandler.cs:12` (and the project-level equivalent), `TaskAuditController`, `ProjectsController.GetAuditAsync`
- **Found:** 2026-08-11, review of `82dca9b`
- **Issue:** `GetTaskAuditLogHandler`/`GetProjectAuditLogHandler` call `ListByTaskIdAsync`/`ListByProjectIdAsync` with no skip/take, and the controllers accept no paging query params — unlike `SearchTasksHandler`/`ListProjectsHandler` from the same era, which both paginate.
- **Risk if left:** A project or task with a long history returns thousands of rows in a single response.
- **Fix:** Add paging params to both audit endpoints, matching the convention already used by task search / project listing.

### 3. Title search filter forces a full table scan

- **Where:** `src/TaskFlow.Infrastructure/Persistence/Repositories/TaskRepository.cs:63` (`ApplyFilter`)
- **Found:** 2026-08-11, review of `480c6fc` ("perf: optimize task search query")
- **Issue:** The search-perf commit added covering indexes for the `ProjectId`/sort paths but left `task.Title.ToLower().Contains(loweredTitle)` unindexable. Any search request including `title=` — including the benchmark's own `TitleContainsFilter`/`CombinedFilters` cases — still scans and lower-cases every row.
- **Risk if left:** Search requests with a title filter don't get the performance benefit the commit was meant to deliver as the `Tasks` table grows.
- **Fix:** Consider a case-insensitive collation/computed column with an index, full-text search, or documenting the scan as an accepted trade-off if table size stays small.

### 4. `TaskDto` → `TaskResponse` mapping duplicated

- **Where:** `src/TaskFlow.Api/Controllers/TaskSearchController.cs:41` vs. `TasksController.CreateAsync:34`
- **Found:** 2026-08-11, review of `480c6fc`
- **Issue:** Both controllers independently construct `TaskResponse` from the same 7 fields. The same PR introduces a `FromDto`/`FromDomain` static-factory pattern for `AuditLogResponse`/`AuditLogDto` that `TaskResponse` could reuse instead.
- **Risk if left:** A future field added to `TaskResponse` only gets updated in one call site unless both are remembered.
- **Fix:** Add a `TaskResponse.FromDto(...)` factory and use it from both controllers.

### 5. Audited-write transaction block copy-pasted across handlers

- **Where:** `src/TaskFlow.Application/Comments/CreateCommentHandler.cs:22`, and equivalently in `CreateProjectHandler`, `CreateTaskHandler`
- **Found:** 2026-08-11, review of `82dca9b`
- **Issue:** The "begin transaction → add entity → build `AuditLog` → add audit log" sequence is duplicated nearly verbatim across three handlers.
- **Risk if left:** A future change to how audited writes are transacted (e.g. retry-on-transient-failure, a shared audit-description builder) requires editing three handlers identically, risking drift between them.
- **Fix:** Extract a shared helper (e.g. `IUnitOfWork.ExecuteAuditedWriteAsync`) that the three handlers call into.

### 6. `AuditLog.TaskId` has no FK — rows can orphan

- **Where:** `src/TaskFlow.Infrastructure/Persistence/Configurations/AuditLogConfiguration.cs:23`
- **Found:** 2026-08-11, review of `82dca9b`
- **Issue:** `AuditLog.TaskId` has no foreign key or cascade relationship to `TaskItem`. This is deliberate today (per a comment in the configuration) since there's no delete-task feature yet, but nothing revisits the trade-off once one is added.
- **Risk if left:** If task deletion is added later (e.g. via `ExecuteDeleteAsync`, as `CommentPersistenceTests` already does for test cleanup), `TaskCreated`/`TaskCommentAdded` audit rows for that `TaskId` survive forever while `GetTaskAuditLogHandler` 404s for that same `TaskId` — an orphaned, unreachable audit trail with no cleanup path.
- **Fix:** When a delete-task feature is designed, decide explicitly whether audit rows should cascade-delete, soft-delete, or be retained with a "task deleted" marker — don't let the current absence of a FK be the de facto decision.
