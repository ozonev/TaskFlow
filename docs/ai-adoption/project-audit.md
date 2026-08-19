# TaskFlow Repository Audit

## Context

Read-only discovery audit of the live TaskFlow repo (branch `Module17`), done to establish an evidenced baseline for AI-adoption decisions — what's actually automatable, what's protected, what's risky — before any skills/agents get built on assumptions. Every claim is cited to a repo path; absent evidence is marked **not found**, never inferred.

---

## 1. Structure & entry points

Solution: `TaskFlow.slnx` (root). Four-layer Clean Architecture (`Domain` → `Application` → `Infrastructure`/`Infrastructure.Migrations.Postgres` → `Api`), plus `ServiceDefaults` and `AppHost` (Aspire) satellites. `TaskFlow.Web` (Vite/React) and `tests/TaskFlow.E2ETests` (Playwright) are **not** in the `.slnx`. `tests/TaskFlow.Tests` references all four layers from one project (intentional, per CLAUDE.md).

Entry point `src/TaskFlow.Api/Program.cs` (17 git-log touches — the hottest file in the repo): wires `AddServiceDefaults()`, branches `UseNpgsql`/`UseSqlite` on a `DatabaseProvider` config key (throws if missing/invalid), `AddProblemDetails()`+`UseExceptionHandler()`, `MapHealthChecks("/health")`, conditional migrate-on-startup, SPA fallback. `global.json` pins SDK `10.0.302` and the **Microsoft.Testing.Platform** test runner (not VSTest) — confirmed by `TaskFlow.Tests.csproj` being `OutputType=Exe` with `xunit.v3.mtp-v2` and zero `Microsoft.NET.Test.Sdk` references anywhere.

Central Package Management (`Directory.Packages.props`) + restore-time audit (`Directory.Build.props`, `NuGetAuditLevel=low`) are both live.

## 2. Commands — verified vs. unverified

| Command | Status |
|---|---|
| `dotnet build`, `dotnet test --filter-not-trait "Category=Postgres"` | **Verified** — literally run in `.github/workflows/ci.yml` |
| `dotnet run --project src/TaskFlow.Api` | Verified structurally (ports match `launchSettings.json`); not executed in this audit |
| `dotnet test --filter-method` / `--filter-class` | **Unverified** — MTP runner confirmed, but no workflow exercises these exact flags |
| `dotnet test --filter-trait "Category=Postgres"` | Trait confirmed real (`ConcurrentDuplicateLabelNameTests.cs`, `ConcurrentProjectCreationTests.cs`); not independently run in CI |
| `dotnet ef ...` (SQLite and Postgres variants) | Verified structurally — both migration sets exist (6 pairs each, matching dates), both projects/refs are wired correctly; live execution against Postgres unverified (needs Docker) |
| Frontend: `npm run typecheck/lint/test/build` (`TaskFlow.Web`) | **Verified** — run in `ci.yml`'s `frontend-build-and-test` job |
| E2E: `npm test` (Playwright) | **Verified** — run in `e2e.yml` against an isolated SQLite DB; no lint/format script exists for this project |

`.editorconfig` + the `format-edited-file.ps1` `PostToolUse` hook auto-format touched `.cs` files on save — confirmed wired in `.claude/settings.json`.

## 3. CI/CD, governance, conventions

Four workflows: `ci.yml` (build/test, path-filtered across .NET/agent-tool/frontend), `claude.yml` (auto PR review against CLAUDE.md on every PR to `develop`, no human-required-reviewer rule attached), `e2e.yml` (Playwright, push/PR to `develop`), `preview-smoke.yml` (manual-only, deliberately no automated per-PR preview deploy).

**No CODEOWNERS, no branch-protection doc, no issue/PR templates found anywhere** (not found). Branching is convention-only: `ModuleN` branches merged to `develop` via PR (git log), documented nowhere except by example in `docs/capstone/TASKFLOW-200-delivery-report.md`. Jira convention: ticket key `TASKFLOW-` — note the delivery report itself flags `TASKFLOW-200` as a fixed capstone report-filing label distinct from the real ticket (`TASKFLOW-9`). That delivery report is the only one in the repo and is the de facto template for future reports.

**Escalation path that does exist**: Terraform/preview infra is protected three ways — hardcoded subscription/tenant pin in `providers.tf`, static `Edit`/`Write` deny rules in `.claude/settings.json`, and a dynamic `PreToolUse` hook (`validate-terraform-target.ps1`) checking live Azure context before any `terraform` command. All documented in `docs/architecture/preview-guardrails.md`. Beyond this, there is **no named human owner or escalation contact** for protected paths — git history points to a single maintainer (Vitalii Ilchenko), not a documented policy.

## 4. Secrets & generated code

No `appsettings.Production.json` exists yet (only referenced as a protected future path). `appsettings.Development.json` holds a local SQLite path + CORS origins, no credentials. Deny list in `.claude/settings.json` matches CLAUDE.md's "Protected paths" exactly, and explicitly only covers `Edit`/`Write`, not shell redirection. Migration-generated code (`*Designer.cs`, `*ModelSnapshot.cs`) exists twice — once per provider — by design.

## 5. Risk hotspots & flaky-test signals

Four recent fix commits mark real risk areas, all in/near the hottest file (`Program.cs`):
- `bc3fe20` — case-insensitive duplicate-label race (unique index was exact-case, weaker than its own pre-check).
- `4f72596` / `438a159` — SPA fallback bugs (missing `UseRouting()` shadowed static files; unscoped fallback 200'd on bad API routes instead of 404).
- `e7dd5b5` — SQLite-over-Azure-Files hit `database is locked` in the preview env; moved to Postgres.

`TECH_DEBT.md` documents a live flaky-test risk: `AuditLogs` rows aren't cleared between tests in shared-fixture collections (`CommentsApiCollection`/`TasksApiCollection`). Only two test files require Docker (`[Trait("Category","Postgres")]`); no skips, no explicit long timeouts, no retry logic elsewhere. `.claude/skills/add-e2e-test/SKILL.md` already defines a 5-way failure classification (test/application/environment/data-isolation/timing) for triaging E2E failures.

Architectural risk multiplier: the EF Core dual-provider setup requires every migration to be hand-generated twice and a shared `.HasUtcConversion()` helper for any `DateTime` property (SQLite/Npgsql round-trip UTC differently) — per `.claude/rules/ef-core.md`.

## 6. Documentation gaps

No root `README.md` anywhere in the repo — the biggest gap found. No general architecture overview outside CLAUDE.md (agent-facing, not a human onboarding doc). No API reference/OpenAPI doc, no CONTRIBUTING guide. `docs/` currently holds only preview-deployment docs and the one capstone delivery report.

---

## Pilot candidates (not implemented — no skills/agents created)

1. **Root `README.md`** — closes the single biggest documented gap, zero risk, purely additive.
2. **Minimal `CODEOWNERS`** — gives protected paths (Terraform, prod config, hooks) an explicit owner instead of an implicit git-blame one.
3. **Fix `TECH_DEBT.md` item #1** (AuditLogs cleanup in shared-fixture tests) — small, scoped, fixes a documented flaky-test risk at a known location.
