---
name: run-taskflow
description: Build, run, and drive the TaskFlow API — a .NET 10 ASP.NET Core Web API with EF Core/SQLite. Use when asked to start TaskFlow, run its tests, build it, hit its endpoints, or verify a change works against the real running server (not just the test suite).
---

TaskFlow is a headless Web API (no UI) — Projects CRUD over SQLite via EF Core.
Drive it with `.claude/skills/run-taskflow/smoke.ps1`, a PowerShell script that
restores dependencies, applies the committed EF Core migration to a fresh
local SQLite database, builds, launches the server in the background,
exercises every endpoint with real HTTP requests, runs the test suite, and
shuts everything down cleanly. All paths below are relative to the repo root.

## Prerequisites

.NET SDK 10.0.302+ (pinned in `global.json`) and `dotnet-ef` (pinned in
`dotnet-tools.json`). Verify/restore:

```powershell
dotnet --version          # 10.0.302 or compatible via rollForward
dotnet restore            # project dependencies
dotnet tool restore       # once per clone, installs dotnet-ef
```

No other services needed — the dev database is a local SQLite file created
from the committed migration (see Run below), not `EnsureCreated()`.

## Build

```powershell
dotnet build
```

## Run (agent path)

Run the smoke driver — it restores, applies the committed migration to a
fresh `taskflow-dev.db`, builds, launches on `http://localhost:5274`, waits
for `/health`, POSTs a project, GETs it back, checks a 404 and a 400
validation error, runs `dotnet build`/`dotnet test`, then tears the server
down:

```powershell
pwsh -File .claude/skills/run-taskflow/smoke.ps1
```

Ends with `== ALL CHECKS PASSED ==` on success; any unexpected status code or
non-zero exit from build/test throws and the script exits non-zero. Server
stdout/stderr while it's up land in `$env:TEMP\taskflow-api.log` /
`taskflow-api.err.log`.

To apply the migration by hand instead of relying on the app's own
Development-only auto-migrate (needs `ASPNETCORE_ENVIRONMENT=Development` for
the same connection-string reason as running the app, see Gotchas):

```powershell
$env:ASPNETCORE_ENVIRONMENT = "Development"
dotnet ef database update --project src/TaskFlow.Infrastructure --startup-project src/TaskFlow.Api
```

To poke it manually instead, launch the same way the script does, then use
`curl`/`Invoke-WebRequest` against `http://localhost:5274`:

```powershell
$env:ASPNETCORE_ENVIRONMENT = "Development"
Start-Process dotnet -ArgumentList "run --project src/TaskFlow.Api --no-launch-profile --urls http://localhost:5274" -RedirectStandardOutput "$env:TEMP\api.log" -RedirectStandardError "$env:TEMP\api.err.log" -WindowStyle Hidden
```

```bash
curl -s http://localhost:5274/health
curl -s -X POST http://localhost:5274/api/projects -H "Content-Type: application/json" -d '{"name":"Website Redesign","description":"Q3 refresh"}'
curl -s http://localhost:5274/api/projects/<id-from-above>
curl -s http://localhost:5274/openapi/v1.json   # Development only
```

Stop it by killing whatever owns port 5274 (see Gotchas — the `dotnet run`
PID is not enough):

```powershell
Get-NetTCPConnection -LocalPort 5274 | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { Stop-Process -Id $_ -Force }
```

## Run (human path)

```powershell
dotnet run --project src/TaskFlow.Api   # http://localhost:5274, https://localhost:7210
```

Blocks the terminal; Ctrl+C to stop. Same auto-migration behavior as the
agent path when run without overriding `ASPNETCORE_ENVIRONMENT`, since
`launchSettings.json`'s profiles set `Development` for you.

## Test

```powershell
dotnet test
dotnet test --filter-method "*Post_WithValidRequest_Returns201WithCreatedProject*"   # single test
```

23 tests pass (endpoint integration tests via `WebApplicationFactory` +
domain unit tests). Note: `--filter-method` matches the test **method** name,
not the controller action it exercises — `*CreateAsync*` (the action name)
matches zero tests; use the `[Fact]`/`[Theory]` method name instead. Also note
`--nologo` is a VSTest flag — this repo's runner is Microsoft.Testing.Platform
(see `global.json`), which rejects it as an unknown option (exit code 5)
instead of ignoring it.

## Gotchas

- **`ASPNETCORE_ENVIRONMENT` is not optional.** `appsettings.json` (base) has
  no `ConnectionStrings:DefaultConnection` — only `appsettings.Development.json`
  does — and `Program.cs` deliberately throws at startup rather than falling
  back to an anonymous SQLite temp DB. Launching without
  `ASPNETCORE_ENVIRONMENT=Development` (e.g. via `Start-Process` with
  `--no-launch-profile`, which skips `launchSettings.json`) fails immediately
  with `Missing connection string 'ConnectionStrings:DefaultConnection'`.
  Set the env var explicitly before `Start-Process` when bypassing the launch
  profile.
- **Killing the `dotnet run` PID does not stop the server.** `dotnet run`
  builds and then execs the real app as a *child* process
  (`TaskFlow.Api.exe`); `Stop-Process` on the PID `Start-Process` gives you
  kills the wrapper only; the child keeps listening on the port and keeps the
  SQLite file (`taskflow-dev.db*`) locked. Stop it by killing whatever
  `Get-NetTCPConnection -LocalPort 5274` reports as `OwningProcess` instead.
- **Migrations apply automatically, only in Development.** `Program.cs` runs
  `Database.MigrateAsync()` on startup when `IsDevelopment()` — no manual
  `dotnet ef database update` needed for local runs, but it also means a
  non-Development launch with a real connection string would need that step
  run separately first. Running the explicit `dotnet ef database update` and
  then starting the app is safe either way: the startup auto-migrate finds
  nothing pending and logs `No migrations were applied` rather than erroring.
- **`dotnet ef database update` also needs `ASPNETCORE_ENVIRONMENT=Development`.**
  Same root cause as the app itself (see above) — the EF tooling loads
  configuration through the same `Program.cs`, so without the env var it
  fails with the identical `Missing connection string` error rather than
  something migration-specific.
- **`dotnet test --nologo` fails outright, it doesn't just ignore the flag.**
  This repo's `global.json` pins the `Microsoft.Testing.Platform` runner, not
  VSTest — `--nologo` isn't a recognized option there and the run exits
  non-zero (`Zero tests ran`, exit code 5) before any test executes. Omit it.
- **The dev SQLite file is gitignored** (`taskflow-dev.db*` matched by `*.db`
  / `*.db-shm` / `*.db-wal` in `.gitignore`) but is created in
  `src/TaskFlow.Api/` on first run — the smoke script deletes it after each
  run so repeated runs start from an empty DB rather than accumulating rows.
