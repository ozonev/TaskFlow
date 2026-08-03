# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```
dotnet build
dotnet run --project src/TaskFlow.Api          # http://localhost:5274, https://localhost:7210
dotnet test                                     # runs on Microsoft.Testing.Platform (see global.json), not VSTest
dotnet test --filter-method "*MethodName"       # single test — VSTest's `--filter "FullyQualifiedName~X"` does NOT match anything here
dotnet test --filter-class "Namespace.ClassName"
```

## Architecture & dependency boundaries

Four-project Clean Architecture layering enforced only by `ProjectReference`s — nothing else blocks a violation, so check the direction before adding a reference:

- **Domain** — entities, value objects, domain logic. No project references, no framework packages. Keep it persistence- and transport-ignorant even though nothing currently stops adding EF Core or ASP.NET types here.
- **Application** — use cases and the interfaces Infrastructure implements ("ports"), plus DTOs for use-case boundaries. References Domain only. Do not add EF Core or ASP.NET packages here even if convenient.
- **Infrastructure** — EF Core (`TaskFlowDbContext`, DbSets, migrations, repository implementations), other outward integrations. References Domain + Application.
- **Api** — composition root: DI wiring, minimal API endpoints, request/response mapping. References Application + Infrastructure. Endpoint handlers call into Application use cases; they must not touch `DbContext` or other Infrastructure types directly.

## API endpoint conventions

- Minimal API, not MVC controllers — `Program.cs` has no `AddControllers`/`MapControllers`; don't introduce them without discussion.
- Group endpoints into per-feature extension methods (e.g. `MapXEndpoints`) called from `Program.cs` once there's more than a couple of routes — don't let `Program.cs` grow into a route file.
- Handlers stay thin: bind/validate the request DTO, call an Application use case, map the result to a response DTO. No business logic or EF Core calls in the handler body.

## DTOs & validation

- Never accept or return Domain entities directly over HTTP — always map to/from request/response DTOs at the Api layer.
- Validate request DTOs at the Api boundary before they reach Application code; don't rely on Domain constructors to reject bad request input.

## EF Core

- `Microsoft.EntityFrameworkCore.Design`/`.Tools` isn't referenced anywhere yet — `dotnet ef migrations add` will fail until it's added to `TaskFlow.Infrastructure`.
- No migrations exist yet. Once the first `DbSet` is added, use migrations from the start; don't reach for `EnsureCreated()` beyond throwaway local experiments.
- DbSets, query logic, and repository implementations belong in Infrastructure, not Application or Api.

## Async

- EF Core and endpoint code should be async end-to-end (`ToListAsync`, `SaveChangesAsync`, async handlers). Don't block with `.Result`/`.Wait()` — it can deadlock or starve Kestrel's thread pool.

## Testing

- `tests/TaskFlow.Tests` references all four `src` projects from one test project — intentional, so tests for any layer belong there rather than a new test project per layer.
- `UnitTest1.cs` is scaffold-only (`Assert.True(true)`) — remove it once real tests exist instead of extending it.

## Logging & security

- Use `ILogger<T>` via DI; no `Console.WriteLine`.
- Never log secrets, connection strings, or full request/response bodies.
- Secrets/connection strings belong in configuration (`appsettings*.json`, user-secrets, or env vars) — never hardcoded in source.
- `/health` is unauthenticated by design; don't attach business data or auth to it without discussion.

## Adding dependencies

- Ask before adding a NuGet package. There's no `Directory.Packages.props`/central version pinning and no CI, so an unreviewed dependency's version and transitive footprint won't be caught automatically.
