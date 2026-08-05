---
paths:
  - "src/TaskFlow.Infrastructure/**"
  - "src/TaskFlow.Infrastructure.Migrations.Postgres/**"
---

## EF Core

- `Microsoft.EntityFrameworkCore.Design` belongs in **`TaskFlow.Api`** (the startup project `dotnet ef` probes) with `PrivateAssets="all"` (drops published output from 62.7 MB to 38.8 MB — see the inline comment in `TaskFlow.Api.csproj` for why). Don't move it to Infrastructure; nothing there needs it.
- `dotnet-ef` is pinned in the root `dotnet-tools.json` (the .NET 10 SDK's default manifest location, not `.config/`). Run `dotnet tool restore` once per clone.
- Every `dotnet ef` command needs both project arguments (see Commands in the root `CLAUDE.md`), because the DbContext and the host that configures it live in different projects: `--project` is where migrations are written; `--startup-project` is where the connection string and DI wiring come from (Api). No custom `IDesignTimeDbContextFactory` exists — `dotnet ef` resolves `TaskFlowDbContext` by building Api's own `Program.cs` host (via `HostFactoryResolver`), so it honors the same `DatabaseProvider`/`ConnectionStrings__DefaultConnection` config the app reads at runtime. Omitting `--startup-project` falls back to `--project`, which has no configuration and fails.
- Never run a Postgres-targeted `dotnet ef` command against `--project src/TaskFlow.Infrastructure` (or vice versa) — that mixes providers' migrations into the wrong assembly.
- Always use migrations; don't reach for `EnsureCreated()` beyond throwaway local experiments. `Program.cs` also applies pending migrations on startup in Development, so `dotnet run` works on a clean clone — `database update` remains the explicit path and both apply the same migrations.
- DbSets, query logic, and repository implementations belong in Infrastructure, not Application or Api. Entity mapping goes in `IEntityTypeConfiguration<T>` classes under `Persistence/Configurations` (picked up by `ApplyConfigurationsFromAssembly`), not attributes on Domain types.
- Provider is chosen by the `DatabaseProvider` config key (`"Sqlite"` default, or `"Postgres"`), read once in `Program.cs`. SQLite needs no config; PostgreSQL needs `DatabaseProvider=Postgres` plus a real `ConnectionStrings__DefaultConnection` supplied externally (env var), never committed. `TaskFlowDbContext`, DbSets, and entity configurations are provider-agnostic — only the provider registration and the migration set differ.
