# TaskFlow preview environment — architecture

## Purpose

A short-lived, non-production environment on Azure Container Apps that a reviewer can hit at a stable URL to see a branch of TaskFlow running end to end (API + frontend + a persisted SQLite database), without standing up Postgres or any production-grade infrastructure. This document is the approved design; it intentionally contains no Terraform or Dockerfile — see [Follow-up work](#follow-up-work).

## Verified Azure context

| Item | Value |
|---|---|
| Tenant | `a0c01160-86c9-4406-8a44-392e8b9c6d9b` ("Default Directory", `vitaliyilchenkonixsolutions.onmicrosoft.com`) |
| Subscription | `ad925f8c-465f-45b4-9632-f6286e0f30e4` — **"Visual Studio Professional"**, state `Enabled` |
| Current identity | `admin@vitaliyilchenkonixsolutions.onmicrosoft.com` (`vitaliy.ilchenko@nixsolutions.com`) — **Owner** at subscription scope |
| Target region | **North Europe** |
| Explicitly non-production? | **Yes.** This is an individual Visual Studio (dev/test) subscription, not a shared team subscription. Its offer terms restrict it to non-production/internal use. It carries **no org-level naming or tagging policy** (`az policy definition list` returns no custom policies — only the default Microsoft Defender for Cloud audit initiative), so the conventions below are proposed fresh rather than inherited. |
| Relevant quota | **Not formally verified.** The `az quota` CLI extension requires an interactive install, which is unavailable in the environment this was checked from. Working assumption, not a verified fact: Consumption-plan Container Apps don't draw on the traditional per-subscription vCPU quota that VMs do, and default subscription limits should comfortably cover a single 0.5 vCPU / 1 GiB replica. Re-check with `az quota list` before relying on this if the deployment is ever scaled beyond one preview app. |
| Prerequisite | `Microsoft.App` (Container Apps) resource provider is currently **`NotRegistered`** on this subscription (`Microsoft.Storage` and `Microsoft.OperationalInsights` already are). Run `az provider register -n Microsoft.App --wait` once before the first `terraform apply` — otherwise Terraform's `azurerm` provider will auto-register it on first apply, which just makes that apply slower and easy to mistake for a hang. |

**Auth note:** the Azure MCP tool available in this environment had a cached credential scoped to a *different* tenant (`f8cdef31-...`) than the Azure CLI session used here, and 401'd on every resource-level call. All verification above was done via `az` CLI directly, using the CLI's authenticated session as the source of truth (confirmed with the resource owner).

## Topology

One resource group holds everything for this preview:

```
rg-taskflow-preview (North Europe)
├── log-taskflow-preview          Log Analytics workspace (30-day retention)
├── cae-taskflow-preview          Container Apps Environment (Consumption)
│   └── ca-taskflow-api-preview   Container App — min=max=1 replica
│         └── volume "data" ──── Azure File share, mounted at /data
├── sttaskflowpreview<suffix>     Storage account (StorageV2, Standard_LRS)
│   └── fs-taskflow-data          Azure File share (5 GiB quota)
└── acrtaskflowpreview<suffix>    Container Registry (Basic SKU)
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
- **Known gap**: `/health` today is a static liveness check only (`self` → always `Healthy`) — it does **not** check the SQLite file, the Azure Files mount, or DB connectivity. A broken file-share mount would report the container as healthy while every request 500s. Acceptable for a throwaway preview; a real DB/mount health check is out of scope here.

## 3. Single replica requirement

`minReplicas: 1, maxReplicas: 1` — no autoscale rules of any kind, not even a placeholder HTTP-concurrency rule.

This is a **data-safety constraint, not a cost optimization**: `/data/taskflow.db` lives on an Azure Files SMB share. SQLite's file-locking model assumes a single writer; SMB-backed locking across multiple container replicas is not a safe pattern for SQLite and can produce `database is locked` errors or, worse, silent corruption under concurrent writes. Scale-to-zero is also rejected — not for data safety, but because it defeats the point of a stable preview URL (cold-start delay, re-running the migration gate on every wake).

## 4. Azure Files mount at /data

- **Storage account**: `sttaskflowpreview<suffix>` — `StorageV2`, `Standard_LRS` (cheapest redundancy tier — acceptable data-loss risk for a 14-day throwaway), `min_tls_version = TLS1_2`.
- **File share**: `fs-taskflow-data`, quota **5 GiB** (SQLite files for this app are tiny; not a production sizing decision), `TransactionOptimized` access tier.
- **Container Apps Environment storage definition**: name `taskflow-data` (the internal reference name used inside the Container App template — distinct from the file share's own name `fs-taskflow-data`), pointed at the storage account + share, `access_mode = ReadWrite`.
- **Container App wiring**: a `volume { name = "data", storage_type = "AzureFile", storage_name = "taskflow-data" }` block plus a `volume_mounts { name = "data", path = "/data" }` block on the container definition.
- **Credential note**: the storage account access key is supplied to the Container Apps Environment storage definition and therefore lands in the Terraform state file in plaintext. This is the concrete reason state protection (§8) matters here — the state file *is* a credential, not just a build artifact.

## 5. SQLite connection

Environment variables set directly on the Container App (no Key Vault — not worth the added complexity for a throwaway preview with no real secret, just a mount path):

- `ConnectionStrings__DefaultConnection = Data Source=/data/taskflow.db` (double-underscore is ASP.NET Core's standard configuration-binding convention for `ConnectionStrings:DefaultConnection`, matching how `appsettings.Development.json` expresses the same key today with `Data Source=taskflow-dev.db`).
- `DatabaseProvider = Sqlite` — matches `Program.cs`'s existing default, set explicitly so intent is visible in the Container App's env-var list rather than relying on the fallback.
- `ASPNETCORE_ENVIRONMENT = Production` — deliberate: it keeps the existing `IsDevelopment()`-gated block (Swagger/OpenAPI, the Development CORS policy, and the pre-existing dev auto-migrate) fully inactive, so migration behavior in preview is controlled *only* by the explicit flag in §6, not tangled up with environment name. **Side effect**: Swagger/OpenAPI UI is not reachable on the preview URL (`MapOpenApi()` is Development-only) — accepted trade-off.

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
| Storage account | `sttaskflowpreview<suffix>` | lowercase alphanumeric only, ≤24 chars |
| Azure File share | `fs-taskflow-data` | 5 GiB, TransactionOptimized |
| Container Apps env storage ref | `taskflow-data` | internal name in the volume block; distinct from the file share's own name |
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

Postgres, multi-region deployment, autoscaling, and any production-grade high-availability feature are deliberately excluded — all of them contradict the single-replica/SQLite/short-lived-preview framing this design is built around.

## Open assumptions / risks

- **Pricing not verified** against the live Azure pricing API — Consumption Container Apps, Standard_LRS storage, and ACR Basic costs are assumed directionally cheap, not confirmed.
- **Quota headroom not verified** (see table above) — re-check with `az quota list` (after installing the `quota` CLI extension) before relying on this if usage ever grows beyond one preview replica.
- **`/health` is liveness-only** (§2) — a mounted-but-broken file share would not be caught by the probe.
- **No CORS changes needed** — because the frontend is same-origin with the API (§1), the existing Development-only CORS policy stays untouched and simply unused in preview.
- **Storage account key in Terraform state** (§4/§8) — the concrete reason local state must never be committed.

## Follow-up work

This document is the approved architecture decision. It does **not** include the actual Terraform module, Dockerfile, or `.gitignore`/`Program.cs` changes described above — those are implementation work for a separate follow-up pass, once this design is approved:

1. `Dockerfile` at the repo root (§1).
2. `Program.cs`: the static-file/SPA-fallback middleware (§1) and the `TASKFLOW_APPLY_MIGRATIONS` guard (§6).
3. `.gitignore`: the Terraform-artifact patterns (§8).
4. `infra/preview/`: the Terraform module implementing §§2–9 (resource group, Log Analytics, Container Apps Environment, Container App, storage account + file share, container registry, tags).
5. Running `az provider register -n Microsoft.App --wait` once, before the first `terraform apply`.
