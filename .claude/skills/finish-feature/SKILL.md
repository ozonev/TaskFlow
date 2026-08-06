---
description: Runs TaskFlow's end-of-feature checklist against the current diff -- build/test verification, diff review, TaskFlow architecture conventions, conditional security review -- and produces a commit-ready summary. Use once feature code already exists and is ready to wrap up. Do not use to design, plan, or implement feature code itself; see /add-api-feature for that.
argument-hint: "[optional: feature brief or context for what should be in scope]"
disable-model-invocation: true
---

Feature context (optional):
$ARGUMENTS

Use when:
- feature code already exists (implementation is done) and needs an end-of-feature check before commit
- following up after /add-api-feature, or run standalone against any pending diff

Do not use for:
- planning or implementing new behavior
- reviewing a diff that isn't yours to finish (e.g. someone else's open PR)
- a working tree with no pending changes to check

Required output:
- build/test results, diff review findings, architecture checklist results, security-review outcome, risks, suggested commit message

Workflow:
1. `git status` and `git diff` — scope the change before anything else. If there's nothing pending, stop and say so.
2. Build/test:
   - `dotnet build` — must succeed with no new warnings.
   - `dotnet test` (default fast filter, `--filter-not-trait "Category=Postgres"`) — must pass.
   - If the diff touches `src/TaskFlow.Infrastructure.Migrations.Postgres/**`, provider-switching logic, or anything under `Persistence/**` that changes the model, also run `dotnet test --filter-trait "Category=Postgres"` (requires Docker). If Docker isn't available, say so explicitly rather than silently skipping.
   - If the Domain/Infrastructure model changed, confirm a matching migration exists in both `src/TaskFlow.Infrastructure/Migrations/` (SQLite) and `src/TaskFlow.Infrastructure.Migrations.Postgres/Migrations/` (Postgres) — the two provider histories must not diverge.
3. Diff review — spawn one `general-purpose` subagent against the diff to check correctness bugs and cleanup opportunities against CLAUDE.md and `.claude/rules/*.md`. Resolve or explicitly defer (with a stated reason) every finding it returns — none get silently dropped.
4. TaskFlow architecture checklist — check the diff against each:
   - **API contracts consistent**: request/response DTOs are records with init accessors, `[MaxLength(...)]` references a Domain constant (never a literal), and an existing DTO is reused across actions on the same resource unless the response genuinely needs a new field set.
   - **Controllers stay thin**: grep changed controllers for `DbContext|TaskFlow\.Domain|TaskFlow\.Infrastructure` — any match means logic leaked into the Api layer. Each action should only build a command, call one handler, map to a response DTO, and return an `ActionResult`.
   - **No EF entities returned from API**: every new/changed endpoint returns an explicit `*Response` DTO, never a Domain type.
   - **Tests cover both paths**: every new/changed endpoint has at least one success test and one primary-failure test (400 validation and/or 404 not found).
   - **No unrelated files changed**: flag anything touched outside Domain/Application/Infrastructure/Api/Tests for this feature instead of silently accepting it.
   - **No package changes without approval**: diff all `*.csproj` for added/bumped `<PackageReference>`. If found, stop and ask before continuing.
   - **Layering boundaries hold**: Domain has no framework references, Application has no EF Core/ASP.NET packages, Api never references `TaskFlowDbContext` or other Infrastructure types directly.
5. Security review (conditional) — invoke `/security-review` only if the diff touches: auth/authorization code; secrets, connection strings, or config files; raw SQL or dynamic query construction; new request DTOs/endpoints accepting external input; logging near request/response bodies or credentials; new dependencies. Otherwise skip it and say so explicitly in the summary — don't omit mention of it.
6. Return a summary with:
   - files changed, grouped by layer
   - behavior added (1-2 sentences)
   - build/test results and which filters ran
   - architecture checklist results (pass/fail per item, not a blanket "looks good")
   - diff review findings (resolved or deferred-with-reason)
   - security review: ran or skipped-and-why, findings if it ran
   - risks / follow-ups
   - unrelated-files / package-change check result
   - suggested commit message

Rules:
- Follow CLAUDE.md and the path-scoped rules under `.claude/rules/`.
- Since `/code-review`, `/verify`, or `/diff`are user-only commands, do their job directly via the steps above instead.
- If a package change or unrelated file is found, stop and ask before finalizing the summary — don't fold it in as an already-decided outcome.
- Never commit or push on your own; this skill ends at "commit-ready," not "committed."
