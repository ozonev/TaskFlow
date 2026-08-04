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

## Code comments

- Don't comment what the code already says. No restating a method name in prose, no narrating each line, no scaffold leftovers like `// Add services to the container.` or `// Learn more about configuring OpenAPI at https://...` — delete those on sight when touching the file.
- A comment earns its place only when it explains a **why** a reader can't derive from the code: a non-obvious constraint, a framework gotcha, or the reason an odd-looking line exists (e.g. why `public partial class Program;` is there). Keep those to one line where possible.
- Prefer clearer names and smaller methods over a comment explaining an unclear one.

## API endpoint conventions

- MVC controllers, not minimal API — `Program.cs` wires `AddControllers()`/`MapControllers()` and holds no routes. Don't reintroduce `MapGet`/`MapPost` route registrations for business endpoints (`/health` stays a minimal-API `MapHealthChecks`).
- One `ControllerBase` per feature under `Controllers/`, attribute-routed (`[ApiController]`, `[Route("api/<resource>")]`). Dependencies come in through the primary constructor.
- Actions stay thin: call an Application use case, map the result to a response DTO. No business logic or EF Core calls in the action body.
- No `CreatedAtAction`/`CreatedAtRoute` pointing at a GET that doesn't exist yet — it throws at runtime. Use `Created($"/api/<resource>/{id}", response)` until the GET action is added.

## DTOs & validation

- Never accept or return Domain entities directly over HTTP — always map to/from request/response DTOs at the Api layer.
- Validate request DTOs at the Api boundary before they reach Application code; don't rely on Domain constructors to reject bad request input.
- `[ApiController]` runs DataAnnotations automatically and short-circuits with a 400 `ValidationProblemDetails` before the action body, so actions need no validation code.
- Request DTOs are records with **init accessors, not positional parameters**, so the accessor can normalise (trim) before validation runs. On a positional record MVC requires validation attributes on the constructor parameter and throws `InvalidOperationException` at request time if it finds them on the property — which rules out normalising accessors. (Minimal API's `AddValidation()` requires the exact opposite; if this project ever moves back, every DTO has to flip.)
- Length limits on DTOs reference the Domain constants (`[MaxLength(Project.NameMaxLength)]`), never a literal — otherwise lowering a domain limit leaves the API accepting input the domain then rejects with a 500.

## EF Core

- `Microsoft.EntityFrameworkCore.Design` belongs in **`TaskFlow.Api`** (the startup project `dotnet ef` probes) with `PrivateAssets="all"`. Keep the `PrivateAssets` — without it the package is a normal runtime dependency and `dotnet publish` ships Roslyn, MSBuild, and the EF design-time assemblies with the app (measured: 62.7 MB vs 38.8 MB). Don't move it to Infrastructure; nothing there needs it.
- `dotnet-ef` is pinned in the root `dotnet-tools.json` (the .NET 10 SDK's default manifest location, not `.config/`). Run `dotnet tool restore` once per clone.
- Every `dotnet ef` command needs both project arguments, because the DbContext and the host that configures it live in different projects. `--project` is where migrations are written (Infrastructure); `--startup-project` is where the connection string and DI wiring come from (Api). Run them from the repo root:
  ```
  dotnet ef migrations add <Name> --project src/TaskFlow.Infrastructure --startup-project src/TaskFlow.Api
  dotnet ef database update       --project src/TaskFlow.Infrastructure --startup-project src/TaskFlow.Api
  dotnet ef database drop --force --project src/TaskFlow.Infrastructure --startup-project src/TaskFlow.Api
  ```
  Omitting `--startup-project` makes the tooling fall back to `--project`, which has no configuration and fails.
- Always use migrations; don't reach for `EnsureCreated()` beyond throwaway local experiments. `Program.cs` also applies pending migrations on startup in Development, so `dotnet run` works on a clean clone — `database update` remains the explicit path and both apply the same migrations.
- DbSets, query logic, and repository implementations belong in Infrastructure, not Application or Api. Entity mapping goes in `IEntityTypeConfiguration<T>` classes under `Persistence/Configurations` (picked up by `ApplyConfigurationsFromAssembly`), not attributes on Domain types.

## Async

- EF Core and endpoint code should be async end-to-end (`ToListAsync`, `SaveChangesAsync`, async handlers). Don't block with `.Result`/`.Wait()` — it can deadlock or starve Kestrel's thread pool.

## Testing

- `tests/TaskFlow.Tests` references all four `src` projects from one test project — intentional, so tests for any layer belong there rather than a new test project per layer.
- Endpoints are covered by real HTTP integration tests via `TaskFlowApiFactory` (`WebApplicationFactory<Program>`) against a SQLite in-memory database that the committed migrations are applied to. Reuse that fixture rather than standing up a new host per feature.
- xUnit v3: pass `TestContext.Current.CancellationToken` to any async call that accepts one, or the xUnit1051 analyzer warns.

## Logging & security

- Use `ILogger<T>` via DI; no `Console.WriteLine`.
- Never log secrets, connection strings, or full request/response bodies.
- Secrets/connection strings belong in configuration (`appsettings*.json`, user-secrets, or env vars) — never hardcoded in source. `DefaultConnection` is only in `appsettings.Development.json`, so any other environment must supply it (e.g. `ConnectionStrings__DefaultConnection`); `Program.cs` throws at startup if it's missing rather than letting `UseSqlite(null)` open an anonymous temp database that 500s on first use.
- `AddProblemDetails()` + `UseExceptionHandler()` are wired, so unhandled exceptions return `application/problem+json` instead of an empty body. Development still shows the developer exception page (stack traces, absolute paths) — that's local-only and intentional.
- `/health` is unauthenticated by design; don't attach business data or auth to it without discussion.

## Adding dependencies

- Ask before adding a NuGet package. There's no `Directory.Packages.props`/central version pinning and no CI, so an unreviewed dependency's version and transitive footprint won't be caught automatically.

## Git

- **Never create a commit on your own.** Always ask first and wait for an explicit go-ahead, even when the change is finished, tests pass, and a commit is the obvious next step. The same goes for `git push`, branch creation, rebases, and resets.
- Staging changes and showing the diff for review is fine and encouraged — stop there and let the user decide when to commit.
