# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```
dotnet build
dotnet run --project src/TaskFlow.Api          # http://localhost:5274, https://localhost:7210
dotnet test                                     # runs on Microsoft.Testing.Platform (see global.json), not VSTest
dotnet test --filter-method "*MethodName"       # single test — VSTest's `--filter "FullyQualifiedName~X"` does NOT match anything here
dotnet test --filter-class "Namespace.ClassName"
dotnet test --filter-not-trait "Category=Postgres"   # default: fast, no Docker required
dotnet test --filter-trait "Category=Postgres"       # escalated: requires Docker running locally, see Testing

# EF Core migrations — SQLite (default provider, no env vars needed)
dotnet ef migrations add <Name> --project src/TaskFlow.Infrastructure --startup-project src/TaskFlow.Api
dotnet ef database update       --project src/TaskFlow.Infrastructure --startup-project src/TaskFlow.Api
dotnet ef database drop --force --project src/TaskFlow.Infrastructure --startup-project src/TaskFlow.Api

# EF Core migrations — PostgreSQL (same commands, targeting the satellite migrations project)
$env:DatabaseProvider = "Postgres"
$env:ConnectionStrings__DefaultConnection = "Host=localhost;Port=5432;Database=taskflow;Username=postgres;Password=postgres"
dotnet ef migrations add <Name> --project src/TaskFlow.Infrastructure.Migrations.Postgres --startup-project src/TaskFlow.Api
dotnet ef database update       --project src/TaskFlow.Infrastructure.Migrations.Postgres --startup-project src/TaskFlow.Api
```

## Architecture & dependency boundaries

Four-project Clean Architecture layering enforced only by `ProjectReference`s — nothing else blocks a violation, so check the direction before adding a reference:

- **Domain** — entities, value objects, domain logic. No project references, no framework packages. Keep it persistence- and transport-ignorant even though nothing currently stops adding EF Core or ASP.NET types here.
- **Application** — use cases and the interfaces Infrastructure implements ("ports"), plus DTOs for use-case boundaries. References Domain only. Do not add EF Core or ASP.NET packages here even if convenient.
- **Infrastructure** — EF Core (`TaskFlowDbContext`, DbSets, migrations, repository implementations), other outward integrations. References Domain + Application.
- **Api** — composition root: DI wiring, MVC controllers, request/response mapping. References Application + Infrastructure, plus Infrastructure.Migrations.Postgres (needed so that satellite assembly is deployed alongside Api — `UseNpgsql(...).MigrationsAssembly(...)` resolves it by name at runtime). Endpoint handlers call into Application use cases; they must not touch `DbContext` or other Infrastructure types directly.
- **Infrastructure.Migrations.Postgres** — an infra-tier satellite, not a fifth layer. Holds only the PostgreSQL migration set for `TaskFlowDbContext`; references Infrastructure only. Exists because EF Core resolves a DbContext's migrations/model snapshot by scanning one assembly, so two providers' migration histories can't coexist in the same assembly as SQLite's.

## Path-scoped rules

Layer-specific conventions live next to the code they govern and load automatically when Claude touches matching files:

- `.claude/rules/ef-core.md` — EF Core, migrations, provider setup (`src/TaskFlow.Infrastructure/**`, `src/TaskFlow.Infrastructure.Migrations.Postgres/**`).
- `.claude/rules/api-endpoints.md` — controller and DTO conventions (`src/TaskFlow.Api/**`).

## Code comments

- Don't comment what the code already says. No restating a method name in prose, no narrating each line, no scaffold leftovers like `// Add services to the container.` or `// Learn more about configuring OpenAPI at https://...` — delete those on sight when touching the file.
- A comment earns its place only when it explains a **why** a reader can't derive from the code: a non-obvious constraint, a framework gotcha, or the reason an odd-looking line exists (e.g. why `public partial class Program;` is there). Keep those to one line where possible.
- Prefer clearer names and smaller methods over a comment explaining an unclear one.

## Async

- EF Core and endpoint code should be async end-to-end (`ToListAsync`, `SaveChangesAsync`, async handlers). Don't block with `.Result`/`.Wait()` — it can deadlock or starve Kestrel's thread pool.

## Testing

- `tests/TaskFlow.Tests` references all four `src` projects from one test project — intentional, so tests for any layer belong there rather than a new test project per layer.
- Endpoints are covered by real HTTP integration tests via `TaskFlowApiFactory` (`WebApplicationFactory<Program>`) against a SQLite in-memory database that the committed migrations are applied to. When a second test class covers the same resource, share one host via an xUnit collection fixture (`[CollectionDefinition]`/`ICollectionFixture<TaskFlowApiFactory>`, see `ProjectsApiCollection`) rather than `IClassFixture<TaskFlowApiFactory>` on each class — the latter still spins up a separate host per class.
- Test classes sharing a collection-fixture host must delete their table's rows in `InitializeAsync` — the fixture's database persists across test classes in the same collection, so without this, tests observe each other's rows (see `CreateProjectEndpointTests`/`GetProjectByIdEndpointTests`).
- New endpoints need integration tests for both their success path and their primary failure path (400 validation, 404 not found, etc.) — a happy-path-only suite is incomplete.
- `TaskFlowPostgresApiFactory` is the escalated counterpart, backed by a real `Testcontainers.PostgreSql` container instead of SQLite's single held-open connection — use it only when a test needs behavior SQLite's fixture architecturally can't exercise (e.g. real concurrent-connection/pool semantics), not as a default. Tests using it are tagged `[Trait("Category", "Postgres")]` and require a local Docker daemon; filter commands are in Commands.
- xUnit v3: pass `TestContext.Current.CancellationToken` to any async call that accepts one, or the xUnit1051 analyzer warns.

## Logging & security

- Use `ILogger<T>` via DI; no `Console.WriteLine`.
- Never log secrets, connection strings, or full request/response bodies.
- Secrets/connection strings belong in configuration (`appsettings*.json`, user-secrets, or env vars) — never hardcoded in source. `DefaultConnection` is only in `appsettings.Development.json`, so any other environment must supply it (e.g. `ConnectionStrings__DefaultConnection`); `Program.cs` throws at startup if it's missing rather than letting `UseSqlite(null)` open an anonymous temp database that 500s on first use.
- `AddProblemDetails()` + `UseExceptionHandler()` are wired, so unhandled exceptions return `application/problem+json` instead of an empty body. Development still shows the developer exception page (stack traces, absolute paths) — that's local-only and intentional.
- `/health` is unauthenticated by design; don't attach business data or auth to it without discussion.

## Adding dependencies

- Ask before adding a NuGet package — there's no version pinning or CI to catch an unreviewed dependency's footprint automatically.

## Git

- **Never create a commit on your own.** Always ask first and wait for an explicit go-ahead, even when the change is finished, tests pass, and a commit is the obvious next step. The same goes for `git push`, branch creation, rebases, and resets.
- Staging changes and showing the diff for review is fine and encouraged — stop there and let the user decide when to commit.
