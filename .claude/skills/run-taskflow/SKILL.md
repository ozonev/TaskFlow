---
name: run-taskflow
description: Build, run, and drive the full TaskFlow stack — a .NET 10 API, a Vite/React frontend, and Postgres, orchestrated by a .NET Aspire AppHost. Use when asked to start TaskFlow, run its tests, build it, hit its endpoints, open the Aspire dashboard, or verify a change works against the real running app (not just the test suite).
---

TaskFlow is a .NET 10 Web API (Projects/Tasks/Comments CRUD over EF Core) plus a
Vite/React frontend, orchestrated together with a Postgres database by the
`src/TaskFlow.AppHost` Aspire AppHost. Drive the whole stack with
`.claude/skills/run-taskflow/aspire-smoke.ps1`, a PowerShell script that launches
the AppHost, waits for the Api and Web resources to come up, exercises the Api
end-to-end over real HTTP (including a CORS preflight from the frontend's
origin), then shuts everything down cleanly. All paths below are relative to
the repo root.

A secondary, Api-only path (SQLite, no frontend, no Aspire) still exists for
quick backend-only checks — see **Run: Api only (secondary)** below — but the
AppHost is the primary way to run this project now that it has more than one
service.

## Prerequisites

- .NET SDK 10.0.302+ (pinned in `global.json`).
- Docker running locally (Rancher Desktop, Docker Desktop, etc.) — the AppHost
  runs Postgres in a container. Verify with `docker info` (look for a
  `Server:` section, not just `Client:`).
- Frontend deps installed once: `npm install` in `src/TaskFlow.Web` (already
  done if `node_modules` exists there — the AppHost does not run `npm install`
  for you).

```powershell
dotnet --version          # 10.0.302 or compatible via rollForward
dotnet restore            # project dependencies
docker info               # confirm a Server: section is present
```

## Build

```powershell
dotnet build TaskFlow.slnx
```

## Run (agent path)

Run the Aspire smoke driver — it checks Docker, clears any stray listeners
from a previous run, launches `src/TaskFlow.AppHost`, waits for the Api
(`/health`) and the Vite dev server to come up, POSTs a project, GETs it back,
checks a 404 and a 400 validation error, checks a CORS preflight from the
frontend's origin, then tears the AppHost down (leaving the Postgres container
running — see Gotchas):

```powershell
pwsh -File .claude/skills/run-taskflow/aspire-smoke.ps1
```

Ends with `== ALL CHECKS PASSED ==` on success; any unexpected status code
throws and the script exits non-zero. AppHost stdout/stderr land in
`$env:TEMP\taskflow-apphost.log` / `taskflow-apphost.err.log`.

To poke it manually instead, launch the same way and open the dashboard:

```powershell
dotnet run --project src/TaskFlow.AppHost
```

The console prints a `Dashboard:` URL and a `Login URL:` with a one-time
token (`https://localhost:17051/login?t=...`) — open that link to see the
`api`, `web`, and `postgres` resources, their logs, and traces. Resource
ports are fixed across runs (set in `src/TaskFlow.AppHost/AppHost.cs` and
`src/TaskFlow.Api/Properties/launchSettings.json`), so you can also just curl
them directly once `/health` responds:

```bash
curl -s http://localhost:5274/health
curl -s -X POST http://localhost:5274/api/projects -H "Content-Type: application/json" -d '{"name":"Website Redesign","description":"Q3 refresh"}'
curl -s http://localhost:5274/api/projects/<id-from-above>
curl -s http://localhost:5274/openapi/v1.json   # Development only
curl -s http://localhost:5273                    # frontend (Vite dev server)
```

Stop it by killing whatever owns the AppHost's ports (see Gotchas):

```powershell
Get-NetTCPConnection -State Listen | Where-Object { $_.LocalPort -in 5273,5274,7210,17051 } | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { Stop-Process -Id $_ -Force }
```

## Run (human path)

```powershell
dotnet run --project src/TaskFlow.AppHost
```

Blocks the terminal; Ctrl+C to stop (this does forward cleanly to Aspire's own
child-process shutdown, unlike killing the wrapper PID for the legacy Api-only
path below). Open the printed `Dashboard:`/`Login URL:` link in a browser.

## Run: Api only (secondary, SQLite, legacy)

For quick backend-only checks that don't need the frontend, Postgres, or
Docker, the original single-service path still works and is unchanged:

```powershell
pwsh -File .claude/skills/run-taskflow/smoke.ps1
```

See that script and the Gotchas below for its specifics (`ASPNETCORE_ENVIRONMENT`,
the SQLite dev database, etc.). This path is superseded by the AppHost for any
work that touches the frontend or Postgres — don't extend it further for
multi-service scenarios, extend `aspire-smoke.ps1` instead.

## Test

```powershell
dotnet test --filter-not-trait "Category=Postgres"    # fast/default: no Docker required
dotnet test --filter-trait "Category=Postgres"        # escalated: requires a local Docker daemon
dotnet test --filter-method "*Post_WithValidRequest_Returns201WithCreatedProject*"   # single test
```

183 tests pass with no Docker (endpoint integration tests via `WebApplicationFactory` +
domain unit tests, SQLite-backed). `TaskFlow.AppHost` and `TaskFlow.ServiceDefaults`
have no tests of their own — they're exercised by `aspire-smoke.ps1` instead. One
test, tagged `[Trait("Category", "Postgres")]`, spins up a real PostgreSQL
container via Testcontainers to prove concurrent-connection behavior the SQLite
fixture can't — it needs Docker running locally and is excluded from both smoke
scripts' `dotnet test` calls for that reason. Note: `--filter-method` matches the
test **method** name, not the controller action it exercises — `*CreateAsync*`
(the action name) matches zero tests; use the `[Fact]`/`[Theory]` method name
instead. Also note `--nologo` is a VSTest flag — this repo's runner is
Microsoft.Testing.Platform (see `global.json`), which rejects it as an unknown
option (exit code 5) instead of ignoring it.

## Gotchas

- **`dotnet run` execs a child process that doesn't receive termination.**
  True for both the AppHost (`TaskFlow.AppHost.exe`) and the legacy Api-only
  path (`TaskFlow.Api.exe`): `Stop-Process` on the `Start-Process`-returned PID
  kills the wrapper only, not the real process listening on the port (which
  also keeps the AppHost's `.exe` file locked, breaking the next `dotnet build`
  with `MSB3027: Could not copy ... apphost.exe`). Kill by port instead — see
  the `Get-NetTCPConnection` one-liner above — before rebuilding or relaunching.
- **`AddViteApp` picks its own random port; pinning it needs `WithEndpoint`,
  not `WithHttpEndpoint` or a `PORT` env var.** `AddViteApp` auto-registers an
  `http` endpoint and launches Vite with a `--port <random>` CLI flag that
  overrides anything in `vite.config.ts` or a `PORT` env var set via
  `WithEnvironment`. Calling `.WithHttpEndpoint()` on it throws a
  duplicate-endpoint error (an endpoint already exists). The fix, used in
  `src/TaskFlow.AppHost/AppHost.cs`, is `.WithEndpoint("http", e => { e.Port =
  5273; e.IsProxied = false; })` — this *mutates* the existing endpoint rather
  than adding a new one. Pinning to 5273 keeps it matching the CORS origin
  already allowlisted in `appsettings.Development.json`
  (`Cors:AllowedOrigins`), so no dynamic CORS wiring is needed on the Api side.
- **The Postgres container is intentionally left running after a smoke run.**
  `AppHost.cs` sets `WithLifetime(ContainerLifetime.Persistent)`, so repeated
  runs reuse the same container/database instead of re-migrating from scratch
  every time (`docker ps` shows it as `postgres-<hash>`). Stop/remove it
  manually (`docker stop <name>`) if you want a clean slate.
- **First launch is slower** — Docker has to pull the `postgres:18.3` image
  and Vite has to cold-start; `aspire-smoke.ps1` polls for up to 60s on each
  readiness check, which is usually enough, but a from-scratch machine may need
  a rerun.
- **`ASPNETCORE_ENVIRONMENT` is not optional for the legacy Api-only path.**
  `appsettings.json` (base) has no `ConnectionStrings:DefaultConnection` —
  only `appsettings.Development.json` does — and `Program.cs` deliberately
  throws at startup rather than falling back to an anonymous SQLite temp DB.
  The AppHost path doesn't hit this: it sets `DatabaseProvider=Postgres` and
  the Postgres connection string itself, and launches Api under its normal
  `launchSettings.json` profile (which sets `Development` for you).
- **`dotnet test --nologo` fails outright, it doesn't just ignore the flag.**
  This repo's `global.json` pins the `Microsoft.Testing.Platform` runner, not
  VSTest — `--nologo` isn't a recognized option there and the run exits
  non-zero (`Zero tests ran`, exit code 5) before any test executes. Omit it.
- **The dev SQLite file is gitignored** (`taskflow-dev.db*` matched by `*.db`
  / `*.db-shm` / `*.db-wal` in `.gitignore`) but is created in
  `src/TaskFlow.Api/` on first run of the legacy Api-only path — that script
  deletes it after each run so repeated runs start from an empty DB rather
  than accumulating rows. This doesn't apply to the AppHost path, which uses
  Postgres.
