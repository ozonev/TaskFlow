# Introduce a .NET Aspire AppHost for TaskFlow

## Context

TaskFlow grew a real frontend (`src/TaskFlow.Web`, a Vite/React app added in `3fc7cb5`/`d2d62e7`) that talks to `TaskFlow.Api` over CORS during local dev. The existing run recipe (`.claude/skills/run-taskflow/smoke.ps1`) predates that frontend entirely: it hand-launches only the Api via `Start-Process`, has to kill whatever process owns port 5274 to stop it (because `dotnet run` execs a child process that doesn't receive the parent's termination signal), and never touches the frontend at all. Separately, TaskFlow already supports Postgres as an alternate `DatabaseProvider`, but there is no real local Postgres setup anywhere in the repo (no docker-compose) — Postgres is only ever spun up ephemerally by Testcontainers inside tests.

The goal is to replace that fragile hand-wiring with a declarative Aspire AppHost that orchestrates the Api, the Web frontend, and a Postgres database together as one unit, then regenerate the project's run recipe so `/run` drives Aspire instead of the old script.

**Why Postgres, not SQLite, as "the database resource":** Aspire's resource model orchestrates things with a lifecycle (containers, processes) that it can reference, wire connection strings into, and show in its dashboard. SQLite is a passive local file — there's no `Aspire.Hosting.Sqlite` container resource, nothing to orchestrate. Postgres already exists as a first-class, tested option in `Program.cs` (`DatabaseProvider=Postgres` / `Npgsql`), so modeling it as an Aspire-managed container is filling a real gap (a persistent local Postgres finally exists) rather than inventing a new database or duplicating SQLite's existing default path — `dotnet run --project src/TaskFlow.Api` on its own keeps defaulting to SQLite exactly as it does today.

## Approach

### 1. `src/TaskFlow.ServiceDefaults` (new project)
Standard Aspire scaffolding: OpenTelemetry wiring, default health checks, service discovery, resilient `HttpClient` defaults. Referenced by `TaskFlow.Api`.

In `Program.cs`, add `builder.AddServiceDefaults()` near the top. **Deliberately do not call `app.MapDefaultEndpoints()`** — `Program.cs` already unconditionally maps `/health` via `AddHealthChecks()`/`MapHealthChecks("/health")`, which CLAUDE.md documents as an intentional, unauthenticated, tested contract (`/health is unauthenticated by design`). The template's own `MapDefaultEndpoints()` would remap `/health` (and add `/alive`) a second time — `AddServiceDefaults()` alone is what wires the OTLP exporter that gets traces into the Aspire dashboard; it doesn't require the endpoint mapping half.

### 2. `src/TaskFlow.AppHost` (new project)
Orchestrates three resources in `Program.cs`:

```csharp
var postgres = builder.AddPostgres("postgres").WithLifetime(ContainerLifetime.Persistent);
var db = postgres.AddDatabase("DefaultConnection", databaseName: "taskflow");

var api = builder.AddProject<Projects.TaskFlow_Api>("api")
    .WithReference(db)
    .WithEnvironment("DatabaseProvider", "Postgres")
    .WaitFor(db)
    .WithHttpHealthCheck("/health");

builder.AddViteApp("web", "../TaskFlow.Web")
    .WithReference(api)
    .WithEnvironment("VITE_API_BASE_URL", api.GetEndpoint("http"))
    .WithEnvironment("PORT", "5273")
    .WaitFor(api);
```

Key design points:
- Naming the **database resource** `DefaultConnection` (while the actual Postgres database inside the container is named `taskflow`) is what makes Aspire's `WithReference(db)` inject the connection string as `ConnectionStrings__DefaultConnection` — exactly the config key `Program.cs` already reads via `GetConnectionString("DefaultConnection")`. No changes needed to Api's connection-string logic.
- `DatabaseProvider` still needs an explicit override — Api defaults to `"Sqlite"` otherwise.
- `WithHttpHealthCheck("/health")` ties the dashboard's per-resource health indicator to the endpoint that already exists, satisfying "health ... endpoints already exposed" without adding a new one.
- Pinning the Vite app's `PORT` to `5273` keeps it matching the CORS origin already whitelisted in `appsettings.Development.json` (`Cors:AllowedOrigins: ["http://localhost:5273"]`) — no CORS changes needed.
- `VITE_API_BASE_URL` is overridden at runtime with the Api resource's actual Aspire-assigned URL, on top of (not replacing) the checked-in `.env.development` default that the plain `npm run dev` path still uses.
- `WithLifetime(ContainerLifetime.Persistent)` keeps the Postgres container/data across `dotnet run` sessions instead of tearing it down every launch.

**Packages** (needed sign-off per CLAUDE.md's "ask before adding a NuGet package" — every one below needs a `Directory.Packages.props` entry):
- AppHost: `Aspire.Hosting.AppHost`, `Aspire.Hosting.PostgreSQL`, `Aspire.Hosting.JavaScript` (confirmed via current docs — this is the current package for JS-app hosting; it supersedes the older `Aspire.Hosting.NodeJs` naming that would otherwise have been remembered).
- ServiceDefaults: the standard `dotnet new aspire-servicedefaults` template set (`Microsoft.Extensions.ServiceDiscovery`, `Microsoft.Extensions.Http.Resilience`, `OpenTelemetry.Extensions.Hosting`, `OpenTelemetry.Exporter.OpenTelemetryProtocol`, `OpenTelemetry.Instrumentation.AspNetCore`, `OpenTelemetry.Instrumentation.Http`, `OpenTelemetry.Instrumentation.Runtime`).
- Confirmed via live web search that the current major line is **Aspire 13.x** (13.4.6 at research time) and is used with .NET 10 in the wild. Exact pinned versions were resolved via `dotnet package search`/NuGet at implementation time rather than hardcoded from training data, since that's a named risk.

Add both new projects to `TaskFlow.slnx`. No CI changes needed: `.github/workflows/ci.yml`'s `code` path filter already covers `src/**`, `**/*.csproj`, `**/*.slnx`, `Directory.Packages.props`, etc., and `dotnet build TaskFlow.slnx` doesn't need Docker (only running/orchestrating the AppHost does).

### 3. `src/TaskFlow.Web/vite.config.ts`
Change the hardcoded `server: { port: 5273 }` to `server: { port: Number(process.env.PORT) || 5273 }` so Aspire's `AddViteApp` (which sets `PORT`) actually controls the listening port, while `npm run dev` outside Aspire keeps defaulting to today's `5273`. This is the only frontend code change needed.

### 4. Launch and drive it
- `dotnet run --project src/TaskFlow.AppHost`, open the dashboard link it prints.
- Confirm `api`, `web`, `postgres` all appear as resources with live logs, `api` shows Healthy via the wired health check, and at least one request produces a trace.
- Prove the core journeys against the orchestrated app: hit `/health`, `POST`/`GET` `/api/projects` (proves the Postgres schema auto-migrated — `Program.cs`'s existing `Database.MigrateAsync()` runs automatically in Development, which is what the AppHost-launched Api runs under via its launch profile), and load the Vite URL Aspire reports to confirm the frontend renders and talks to the API with no CORS errors.

### 5. Regenerate the run recipe
Re-run `/run-skill-generator` against the AppHost so `.claude/skills/run-taskflow/SKILL.md`'s **"Run (agent path)"** launches via `dotnet run --project src/TaskFlow.AppHost` instead of `smoke.ps1`'s hand-rolled `Start-Process`/port-kill dance. `smoke.ps1`'s actual HTTP assertions (POST/GET/404/400 against `/api/projects`) are still useful and get adapted to run against the AppHost-launched Api rather than deleted outright; its manual process-lifecycle code is retired. The plain single-service SQLite path (`dotnet run --project src/TaskFlow.Api`) stays documented as a secondary, explicitly-marked-superseded option for Api-only work — not deleted, so there aren't two competing primary recipes.

### 6. `/run` vs `/verify` — a real constraint, not an oversight
Per Claude Code's docs (`code.claude.com/docs/en/skills`), `/verify` is a bundled skill that **"runs only when you invoke"** it — it is deliberately not something an agent can trigger autonomously, unlike `/run`. So the division of labor is:
- The agent invokes `/run-skill-generator` and then `/run` as part of this work, to build the regenerated recipe and prove it launches/drives the app end-to-end.
- The user runs `/verify` themselves afterward as the final confirmation step. (It may also write its own recorded recipe to `.claude/skills/verify/SKILL.md` at the repo root on first use, per the same docs — expected, not a mistake if it appears.)

## Self-check against the stated acceptance criteria and risks

**Acceptance criteria:**
1. *One command launches API, frontend, and database together* — yes, `dotnet run --project src/TaskFlow.AppHost`.
2. *Dashboard shows services, logs, traces* — yes: three resources (`api`/`web`/`postgres`) show up automatically; traces require `AddServiceDefaults()`'s OTLP wiring, which is included.
3. *Core journeys pass against the orchestrated app* — covered in step 4's manual pass; final sign-off is the user's `/verify` run.
4. *Regenerated run recipe drives the Aspire launch with no untested placeholders* — step 5; only commands actually run get written into `SKILL.md`, per `/run-skill-generator`'s own rules.
5. *SQLite/Postgres modeled as a resource, not reinvented* — using the existing `DatabaseProvider=Postgres` path via `WithEnvironment`, not a new provider or config mechanism.

**Task-specific risks:**
- *Duplicated connection strings/ports* — avoided by naming the database resource `DefaultConnection` (auto-matches Api's existing config key) and pinning the Vite port to the value already CORS-allowlisted, instead of inventing new config.
- *Aspire as ceremony without replacing the fragile launch* — `smoke.ps1`'s brittle process/port-kill logic is explicitly retired in step 5, not left running alongside the new path.
- *Run recipe still pointing at the old script* — step 5 rewrites "Run (agent path)" specifically; the old path is kept only as a clearly-marked secondary option.
- *Silently swapping the database* — the AppHost's job here is orchestration; SQLite remains the default for the non-Aspire `dotnet run --project src/TaskFlow.Api` path, unchanged.
- *Remembered/stale Aspire version* — addressed above: version resolved at implementation time via `dotnet package search`, not hardcoded; already caught one stale-memory issue this way (`Aspire.Hosting.NodeJs` → `Aspire.Hosting.JavaScript`).

## Files touched
- `src/TaskFlow.ServiceDefaults/` — new project
- `src/TaskFlow.AppHost/` — new project + `Program.cs`
- `src/TaskFlow.Api/TaskFlow.Api.csproj` — add ServiceDefaults reference
- `src/TaskFlow.Api/Program.cs` — add `builder.AddServiceDefaults()`
- `src/TaskFlow.Web/vite.config.ts` — read `process.env.PORT`
- `TaskFlow.slnx` — add the two new projects
- `Directory.Packages.props` — new `PackageVersion` entries
- `.claude/skills/run-taskflow/SKILL.md` and `smoke.ps1` (or its replacement) — regenerated to drive the AppHost

## Verification
1. `dotnet build TaskFlow.slnx` succeeds with the two new projects added.
2. `dotnet run --project src/TaskFlow.AppHost` launches all three resources; dashboard shows them Healthy with logs/traces.
3. Manual HTTP pass: `/health` 200, `POST`/`GET /api/projects` round-trip against the Postgres-backed Api, frontend loads and creates/reads a project through the UI with no console/CORS errors.
4. `dotnet test --filter-not-trait "Category=Postgres"` still passes unchanged (AppHost/ServiceDefaults don't touch existing test projects).
5. Regenerated `.claude/skills/run-taskflow/SKILL.md` followed line-by-line from a fresh shell works without improvisation (the `/run-skill-generator` "Verify" step).
6. The user runs `/verify` as the final gate, since an agent can't invoke it autonomously.
