# TaskFlow preview environment — architecture

## Purpose

A short-lived, non-production environment on Azure Container Apps that a reviewer can hit at a stable URL to see a branch of TaskFlow running end to end (API + frontend + a persisted PostgreSQL database), without any production-grade infrastructure. This document is the approved design; it intentionally contains no Terraform or Dockerfile — see [Follow-up work](#follow-up-work).

**Revision note**: this preview originally used SQLite on an Azure Files SMB mount. That was replaced with PostgreSQL after a real deployment got stuck in `CrashLoopBackOff` — SQLite's exclusive-locking mechanism doesn't work reliably over SMB from a Linux container, confirmed by reproducing the identical `SQLite Error 5: database is locked` failure on a freshly deleted, brand-new database file (ruling out a stale-lock explanation; it failed on the very first write, every time). The app already supported PostgreSQL as a first-class `DatabaseProvider`, so switching to it — a real client-server database, not a file needing filesystem-level locks — was the fix, not a stylistic preference. §§3–6 below reflect the current, Postgres-based design.

## Verified Azure context

| Item | Value |
|---|---|
| Tenant | `<tenant-id>` ("Default Directory", `<tenant-domain>`) |
| Subscription | `<subscription-id>` — **"Visual Studio Professional"**, state `Enabled` |
| Current identity | `<sign-in-identity>` — **Owner** at subscription scope |
| Target region | **North Europe** |
| Explicitly non-production? | **Yes.** This is an individual Visual Studio (dev/test) subscription, not a shared team subscription. Its offer terms restrict it to non-production/internal use. It carries **no org-level naming or tagging policy** (`az policy definition list` returns no custom policies — only the default Microsoft Defender for Cloud audit initiative), so the conventions below are proposed fresh rather than inherited. |
| Relevant quota | **Not formally verified.** The `az quota` CLI extension requires an interactive install, which is unavailable in the environment this was checked from. Working assumption, not a verified fact: Consumption-plan Container Apps don't draw on the traditional per-subscription vCPU quota that VMs do, and default subscription limits should comfortably cover a single 0.5 vCPU / 1 GiB replica. Re-check with `az quota list` before relying on this if the deployment is ever scaled beyond one preview app. |
| Prerequisite | `Microsoft.App` (Container Apps) resource provider is currently **`NotRegistered`** on this subscription (`Microsoft.Storage` and `Microsoft.OperationalInsights` already are). Run `az provider register -n Microsoft.App --wait` once before the first `terraform apply` — otherwise Terraform's `azurerm` provider will auto-register it on first apply, which just makes that apply slower and easy to mistake for a hang. |

**Auth note:** the Azure MCP tool available in this environment had a cached credential scoped to a *different* tenant (`<other-tenant-id>`) than the Azure CLI session used here, and 401'd on every resource-level call. All verification above was done via `az` CLI directly, using the CLI's authenticated session as the source of truth (confirmed with the resource owner).

**Redaction note:** the real tenant ID, subscription ID, and identity email verified above have been replaced with placeholders in this committed doc — this repository is public, and those values are real identifiers tied to a personal Azure account rather than content the architecture decisions in this doc depend on. The real values are recorded internally outside this file.

## Topology

One resource group holds everything for this preview:

```
rg-taskflow-preview (North Europe)
├── log-taskflow-preview                Log Analytics workspace (30-day retention)
├── cae-taskflow-preview                Container Apps Environment (Consumption)
│   └── ca-taskflow-api-preview         Container App — min=max=1 replica
│         └── ConnectionStrings__DefaultConnection ──▶ psql-taskflow-preview-<suffix>
├── psql-taskflow-preview-<suffix>      PostgreSQL Flexible Server (Burstable B1ms)
│   └── taskflow                        Database
└── acrtaskflowpreview<suffix>          Container Registry (Basic SKU)
```

`<suffix>` is a 5-character lowercase-alphanumeric string (e.g. Terraform's `random_string`) appended to keep the two globally-unique, DNS-constrained resource names (storage account, registry) collision-free while respecting their naming rules (storage accounts: 3–24 lowercase-alphanumeric chars only).

## 1. Container image and static frontend packaging

**Decision: one container image, one Container App.** The API serves the prebuilt frontend as static files from its own `wwwroot`, rather than running the frontend as a second Container App or hosting it on an Azure Storage static website.

Why: a second Container App would be a second billable always-on workload, a second ingress/FQDN, and would require extending the API's CORS policy — which today is Development-only and scoped to `http://localhost:5273` (`Program.cs`, `Cors:AllowedOrigins`). Serving the frontend same-origin from the API eliminates CORS entirely for preview; that policy stays exactly as it is today and is simply inactive in this environment. An Azure Storage static website is cheaper in isolation but adds a second resource with its own DNS/CORS story, for a 14-day environment where "one Terraform module, one URL, one thing to redeploy" is worth more than the marginal storage saving.

**Required code change** (not part of this document's scope — see [Follow-up work](#follow-up-work)): `Program.cs` needs `app.UseDefaultFiles()` + `app.UseStaticFiles()` (after `UseHttpsRedirection()`) to serve `wwwroot`, and `app.MapFallbackToFile("index.html")` (after `MapControllers()`) so unmatched non-API routes fall back to the SPA shell for client-side routing. Endpoint routing matches the health check and controller routes first regardless of declaration order, so this doesn't affect `/health` or any API endpoint.

**Dockerfile** (multi-stage, at repo root — the build context must be the repo root because `TaskFlow.Api.csproj` references sibling projects, so a context scoped to `src/TaskFlow.Api` alone can't `dotnet restore`):

1. `frontend-build` — `node:20-alpine`; `npm ci` against `src/TaskFlow.Web/package*.json`, then `npm run build` (`tsc -b && vite build`) producing `dist/`.
2. `backend-build` — `mcr.microsoft.com/dotnet/sdk:10.0` (matches `global.json`'s `10.0.302`); restore + `dotnet publish src/TaskFlow.Api/TaskFlow.Api.csproj -c Release -o /app/publish`.
3. `final` — `mcr.microsoft.com/dotnet/aspnet:10.0`; copies the publish output and copies `frontend-build`'s `dist/` into `./wwwroot`; `ASPNETCORE_HTTP_PORTS=8080`, `EXPOSE 8080`, `ENTRYPOINT ["dotnet", "TaskFlow.Api.dll"]`.

The image is pushed to `acrtaskflowpreview<suffix>` (Basic SKU — cheapest ACR tier). The Container App pulls it using its **system-assigned managed identity** granted `AcrPull` on that registry — no registry admin credentials are stored anywhere.

## 2. Container Apps ingress and health path

- **Ingress**: external, so the preview is reachable from a browser outside Azure. Default `*.<environment-id>.northeurope.azurecontainerapps.io` FQDN with Azure-managed TLS — no custom domain.
- **Target port**: `8080`, matching `ASPNETCORE_HTTP_PORTS=8080`.
- **Health path**: `/health`, used for both liveness and readiness probes. A **startup probe** on the same path with a generous threshold (e.g. 10 attempts, 5s apart) is required because when `TASKFLOW_APPLY_MIGRATIONS=true` (§6), the container runs `Database.MigrateAsync()` before serving traffic — a tight liveness probe could otherwise kill the container mid-migration on cold start and cause a restart loop.
- **Known gap**: `/health` today is a static liveness check only (`self` → always `Healthy`) — it does **not** check DB connectivity. A broken connection to Postgres would report the container as healthy while every request 500s. Acceptable for a throwaway preview; a real DB health check is out of scope here.

## 3. Single replica requirement

`minReplicas: 1, maxReplicas: 1` — no autoscale rules of any kind, not even a placeholder HTTP-concurrency rule.

**Revised rationale**: this was originally a data-safety constraint (SQLite's file-locking model doesn't tolerate multiple writers, and turned out not to tolerate even a single writer over Azure Files SMB — see the revision note above). PostgreSQL handles concurrent writers natively via row-level locking and MVCC, so the hard data-safety requirement no longer applies. The pin stays anyway, now as a **cost/simplicity choice**: nobody has asked for autoscaling, and adding it would be solving a problem this 14-day throwaway preview doesn't have. Scale-to-zero is still rejected for the same reason as before — it defeats the point of a stable preview URL.

## 4. PostgreSQL database

- **Server**: `psql-taskflow-preview-<suffix>` — Azure Database for PostgreSQL **Flexible Server** (the only actively-supported Postgres offering on Azure; classic "Single Server" is retired), version 16, `B_Standard_B1ms` (Burstable, cheapest tier), 32 GiB storage (Flexible Server's platform-enforced floor regardless of SKU — not a sizing decision, real usage needs far less), 7-day backup retention, no geo-redundant backups, no high availability.
- **Database**: `taskflow` (matches the name the local Aspire AppHost already uses), `UTF8` charset, `en_US.utf8` collation.
- **Admin credentials**: login `taskflowadmin`, password generated via Terraform's `random_password` (24 chars, alphanumeric-only — deliberately no special characters, to avoid needing to escape anything inside the Npgsql keyword-value connection string). Exposed from `platform` as a `sensitive = true` output. Lands in the Terraform state file in plaintext regardless of the `sensitive` flag (which only redacts CLI output, not the state file) — the same accepted-risk pattern already documented for state protection (§8): the state file *is* a credential store here, not just a build artifact.
- **Networking**: public access enabled, with a firewall rule allowing Azure-origin traffic (`start_ip_address`/`end_ip_address` = `0.0.0.0`, Azure's documented convention for "any Azure service") rather than VNet-integrating the Container Apps Environment — a much larger, costlier change not warranted here. This extends the same public-with-credential-gating posture the storage account already had by default in the SQLite design, rather than introducing a new risk category; the real access gate is the random password, not network isolation.

## 5. PostgreSQL connection

The connection string is assembled in Terraform from `platform`'s outputs (host, database name, admin login, password) and wired into the Container App as a **Container Apps secret** (`secret { name = "db-connection-string", value = ... }`, referenced via `env { name = "ConnectionStrings__DefaultConnection", secret_name = "db-connection-string" }`) rather than a plain environment variable — unlike the SQLite connection string, this one carries a real credential, so it's kept out of the Container App's plain env-var listing.

- `ConnectionStrings__DefaultConnection = Host=<fqdn>;Port=5432;Database=taskflow;Username=taskflowadmin;Password=<random>` — standard Npgsql keyword-value format (double-underscore is ASP.NET Core's standard configuration-binding convention for `ConnectionStrings:DefaultConnection`).
- `DatabaseProvider = Postgres` — selects `Program.cs`'s `UseNpgsql(...)` branch, which sets `MigrationsAssembly(PostgresMigrationsAssembly.Name)` to point at the already-existing, already-matching `TaskFlow.Infrastructure.Migrations.Postgres` migration set.
- `ASPNETCORE_ENVIRONMENT = Production` — unchanged from the SQLite design; still keeps Swagger/CORS/dev-auto-migrate inactive, decoupled from the explicit migration flag in §6.

## 6. Preview-only migration behavior

`TASKFLOW_APPLY_MIGRATIONS=true` is set as a Container App environment variable for this preview.

> **This is not the production migration strategy, and must not be copied into any production deployment plan.** It is acceptable here — and only here — because this Container App is hard-pinned to exactly one replica (§3): there is no possibility of two instances racing to apply `Database.MigrateAsync()` concurrently, which is the usual reason startup-time auto-migration is dangerous at scale.

The code change this implies (follow-up work, not applied by this document): today, `Database.MigrateAsync()` only runs inside `if (app.Environment.IsDevelopment())`. Since §5 sets `ASPNETCORE_ENVIRONMENT=Production` for preview, the migration call needs an independent condition evaluated separately from the OpenAPI/CORS block — effectively `app.Environment.IsDevelopment() || builder.Configuration.GetValue<bool>("TASKFLOW_APPLY_MIGRATIONS")` — with the `Database.MigrateAsync()` call itself unchanged, just reachable from this new condition in addition to the Development one.

For a real production path (out of scope here, noted for completeness): migrations should be applied by a dedicated one-shot step — a Container Apps Job, or a CI/CD release step running `dotnet ef database update` — decoupled entirely from application startup and from replica count, so this shortcut is never needed.

## 7. Resource names and mandatory tags

| Resource | Name | Notes |
|---|---|---|
| Resource group | `rg-taskflow-preview` | North Europe |
| Log Analytics workspace | `log-taskflow-preview` | 30-day retention (practical minimum for the PerGB2018 SKU) |
| Container Apps Environment | `cae-taskflow-preview` | Consumption only, no dedicated workload profiles |
| Container App | `ca-taskflow-api-preview` | min=max=1 replica, 0.5 vCPU / 1 GiB |
| PostgreSQL Flexible Server | `psql-taskflow-preview-<suffix>` | Burstable B1ms, PostgreSQL 16 |
| PostgreSQL database | `taskflow` | matches the name AppHost uses locally |
| Container Registry | `acrtaskflowpreview<suffix>` | alphanumeric only, no hyphens, Basic SKU |

Naming convention: `<type-abbrev>-taskflow-preview` for resources that allow hyphens; `<typeabbrev>taskflowpreview<suffix>` (no hyphens, lowercase) for globally-unique DNS-constrained resources (storage, registry). No region suffix — single-region, short-lived, not worth the extra length.

**Mandatory tags**, applied per-resource via a shared Terraform `local.common_tags` map (Azure does not inherit tags from the resource group automatically):

```
environment  = "preview"
project      = "taskflow"
owner        = "vitalii.ilchenko@nixs.com"
expiry-date  = "2026-08-28"
managed-by   = "terraform"
```

**Note on the `owner` value**: it intentionally holds the resource owner's routine work email, not the email of the Azure sign-in identity used to provision these resources (redacted above) — the two differ by design, not by typo. The Azure account and the person's usual point of contact aren't always the same address, and the tag is meant to answer "who do I email about this resource," not "which account created it."

## 8. State ownership and .gitignore rules

**Decision: local Terraform state**, not a remote backend. This is a single-operator personal subscription — a remote backend (its own Storage Account + blob container, plus tagging and eventual teardown) is disproportionate infrastructure for a 14-day throwaway. Local state lives at `infra/preview/terraform.tfstate`.

**Risk, accepted explicitly**: if the operator's machine/checkout is lost, so is the state file. Mitigation: cleanup (§9) has a state-independent fallback (resource-group deletion).

**Required `.gitignore` additions** (new section — none of the existing patterns cover Terraform today):

```gitignore
# Terraform (preview environment infra — infra/preview/)
**/.terraform/
*.tfstate
*.tfstate.*
*.tfstate.backup
*.tfplan
crash.log
crash.*.log
*.tfvars
*.tfvars.json
!*.tfvars.example
```

`.terraform.lock.hcl` is **not** ignored — standard Terraform guidance is to commit the provider lock file, even for a single operator, so a future `terraform init` reproduces the same provider versions. (Applying this `.gitignore` change is follow-up work — see below.)

## 9. Estimated lifetime and cleanup owner

- **Default lifetime**: 14 days from creation. Created 2026-08-14 → `expiry-date` tag = **2026-08-28**.
- **Cleanup owner**: the individual subscription's Owner-role identity — there is no shared team governance over this personal Visual Studio subscription, no Azure Policy enforcing expiry, and no automated expiry pipeline (building one would be over-engineering for a single-operator throwaway).
- **Cleanup mechanism**: primary path is `terraform destroy` from `infra/preview/` (removes exactly what Terraform created, in dependency order). Fallback, if state is unavailable: `az group delete --name rg-taskflow-preview --yes --no-wait` — safe, since every resource in this design lives inside that one resource group.
- **Explicit risk**: nothing auto-deletes this environment on 2026-08-28 — the `expiry-date` tag is informational only, not enforced. The operator should set a manual reminder for that date.

## Not in scope for this preview

Multi-region deployment, autoscaling, and any production-grade high-availability feature (for either the Container App or the PostgreSQL server) are deliberately excluded — all of them contradict the single-replica/short-lived-preview framing this design is built around.

## Open assumptions / risks

- **Pricing not verified** against the live Azure pricing API — Consumption Container Apps, Postgres Flexible Server Burstable B1ms, and ACR Basic costs are assumed directionally cheap, not confirmed. Unlike the SQLite design, this one has a second continuously-billed resource (the Postgres server itself), not just the Container App.
- **Quota headroom not verified** (see table above) — re-check with `az quota list` (after installing the `quota` CLI extension) before relying on this if usage ever grows beyond one preview replica.
- **`/health` is liveness-only** (§2) — a broken Postgres connection would not be caught by the probe.
- **No CORS changes needed** — because the frontend is same-origin with the API (§1), the existing Development-only CORS policy stays untouched and simply unused in preview.
- **Postgres admin password in Terraform state** (§4/§8) — the concrete reason local state must never be committed; the `sensitive` output flag only redacts CLI output, not the state file itself.
- **Public network access on the Postgres server** (§4) — gated by a random 24-char password rather than network isolation, since no VNet integration exists for the Container Apps Environment. Acceptable for a 14-day throwaway; would need revisiting for anything longer-lived.

## Follow-up work

This document is the approved architecture decision. It does **not** include the actual Terraform module, Dockerfile, or `.gitignore`/`Program.cs` changes described above — those are implementation work for a separate follow-up pass, once this design is approved:

1. `Dockerfile` at the repo root (§1).
2. `Program.cs`: the static-file/SPA-fallback middleware (§1) and the `TASKFLOW_APPLY_MIGRATIONS` guard (§6).
3. `.gitignore`: the Terraform-artifact patterns (§8).
4. `infra/preview/`: the Terraform module implementing §§2–9 (resource group, Log Analytics, Container Apps Environment, Container App, storage account + file share, container registry, tags).
5. Running `az provider register -n Microsoft.App --wait` once, before the first `terraform apply`.
