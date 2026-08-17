# TaskFlow preview environment — target-protection guardrails

## Purpose

Companion to [`preview-environment.md`](./preview-environment.md), which covers the preview's resource architecture. This document covers a different concern: what actually stops a Terraform run — today or in the future — from touching the wrong subscription, tenant, directory, or state file. It exists because none of that was true before this pass: `infra/preview/{platform,application}/providers.tf` had no subscription/tenant pinning, `.claude/settings.json` had no rules mentioning Terraform state/plan/var files, and no hook inspected Terraform commands at all.

## The principle: protect targets, not command text

A safeguard that scans a command string for the substring `prod` is not a safeguard. A production target can be selected through **credentials**, **backend state**, **workspace**, **subscription**, or **variable files** — none of which require the word "prod" to appear anywhere. Every control below checks a *resolved value* (a literal in a `.tf` file, a file path, a live `az account show` result, a Terraform workspace name) — never command text for a keyword.

## Primary controls

### 1. Hardcoded subscription/tenant pin (the strongest control)

`infra/preview/platform/providers.tf` and `infra/preview/application/providers.tf` both set:
```hcl
provider "azurerm" {
  subscription_id = "ad925f8c-465f-45b4-9632-f6286e0f30e4"
  tenant_id       = "a0c01160-86c9-4406-8a44-392e8b9c6d9b"
  features {}
}
```
These are **literals, not variables with a default**. A Terraform input variable can always be overridden via `-var`/`-var-file` regardless of any `validation` block — a default only changes what happens when nobody overrides it. A literal has no override mechanism at all. This means: no `terraform` command run against either root can ever call a different subscription or tenant, full stop — not "will be flagged," structurally cannot happen. If the active credential doesn't have access to that exact subscription/tenant, authentication fails immediately and loudly, which is the correct failure mode.

### 2. Static, path-based permission denies

`.claude/settings.json`'s `permissions.deny` blocks the `Edit`/`Write` tools on:
- `**/*.tfstate`, `**/*.tfstate.*` — state files are Terraform-managed; nothing should hand-edit them, ever.
- `**/*.tfplan` — plan-file immutability. Once `terraform plan -out=` generates a plan, it must be reviewed and applied exactly as generated; nothing should modify it in between.
- `**/*.production.tfvars` — a naming convention established now, before any production Terraform exists in this repo, so it's already locked down before the first production `.tfvars` file is ever created.

**Honest limitation, stated plainly**: this blocks Claude's `Edit`/`Write` tools specifically. It does not block `Bash`/`PowerShell` shell redirection (`echo ... > foo.tfstate` still works, same as the existing `.env`/`appsettings.Production.json` rules already documented in `CLAUDE.md`). It is not a substitute for keeping real state/secrets out of reach entirely — it raises the bar for an accidental edit, it does not make one impossible.

### 3. `PreToolUse` hook — dynamic target validation, reinforcement only

`.claude/hooks/validate-terraform-target.ps1`, registered for `Bash|PowerShell` in `.claude/settings.json`. Static path permissions (control #2) can't see *which directory a shell command executes in* or *what the live Azure context is at the moment it runs* — that's not a file-path property, it's runtime state. The hardcoded pin (control #1) only protects once Terraform is actually invoked against one of the two approved roots; it says nothing about whether a command was pointed at those roots in the first place. The hook closes that specific gap:

1. Reads the approved subscription/tenant by parsing `infra/preview/platform/providers.tf` at run time — a single source of truth, not a second hardcoded copy that could drift from control #1.
2. Independent of the terraform-specific gate below: any `az` command carrying an explicit `--subscription` flag (e.g. `az acr build`) must target that same approved subscription.
3. Only acts on `Bash`/`PowerShell` commands matching an actual `terraform` invocation followed immediately by one of `plan|apply|destroy|init|import|taint|untaint|force-unlock|state|workspace` — anchored to a command boundary (start of string, or after `cd`/`&&`/`;`/`|`/a newline) and spanning multi-line commands, specifically so neither a multi-line script nor prose merely mentioning "terraform" and "apply" nearby can bypass or falsely trip it.
4. Resolves the *effective* working directory (a `-chdir=` flag, a leading `cd <path> &&`, or the tool call's own `cwd` — relative paths resolved against that `cwd`, not the hook process's own ambient directory) and requires it to be **exactly** `infra/preview/platform` or `infra/preview/application` — no subdirectory or prefix match.
5. Runs `az account show` and requires the live subscription **and** tenant to exactly equal the values read in step 1.
6. Requires `terraform workspace show` to report `default` — this project has never adopted named workspaces, so an unexpected one signals state-namespace confusion worth stopping on.
7. Any mismatch → exits 2, which blocks the tool call with a clear message naming the actual vs. expected value (never a secret — subscription/tenant IDs aren't credentials). All checks pass → exits 0.

This is reinforcement layered on top of control #1, not a replacement for it — if the hook were ever removed or misconfigured, the hardcoded provider pin still holds. Belt and suspenders, in that order of primacy.

### 4. Protected GitHub Environment — required for any future CI deployment

No CI workflow deploys or destroys this infrastructure today (`.github/workflows/ci.yml` only builds/tests; `claude.yml` only automates PR review) — there is nothing to gate yet. This is a forward-looking requirement for whoever adds that workflow:
- The deploy/destroy job **must** declare `environment: preview` in its YAML.
- That `preview` environment **must** have required reviewers configured in the repository's Settings → Environments (GitHub blocks the job until an approved reviewer approves the run — a real approval gate, not a comment).
- Its Azure credential **must** be an OIDC federated credential scoped to only the preview subscription/resource-group, never a broad long-lived service-principal secret.

### 5. Time/budget alert — outside Claude Code, by design

Deliberately not created against this pass's infrastructure (it was destroyed in the same task this doc was written for — see [Follow-up work](#follow-up-work)). Baked into the `/deploy-preview-env` skill instead, as a required step for the *next* deployment, immediately after `platform` applies successfully:
```
az consumption budget create \
  --budget-name budget-taskflow-preview \
  --resource-group rg-taskflow-preview \
  --amount <nominal-monthly-amount> \
  --category cost \
  --time-grain monthly \
  --start-date <today> \
  --end-date <expiry-date tag value> \
  --notifications '{"Actual_GreaterThan_90_Percent": {"enabled": true, "operator": "GreaterThan", "threshold": 90, "contactEmails": ["<owner tag email>"]}}'
```
This alert fires from Azure's own billing pipeline regardless of whether Claude Code (or any agent) is running — genuinely external, not a reminder that depends on a future session remembering to check.

### 6. Resource tags — owner and expiry

Already implemented (`local.common_tags` in `infra/preview/platform/locals.tf`, applied to every resource): `owner`, `expiry-date`, `environment`, `project`, `managed-by`. No new work here; recorded for completeness since it's one of the requested primary controls.

## Production/preview separation invariant

There is no production Terraform in this repository today. This invariant is stated now, before any exists, so it's already true rather than retrofitted:
- Production Terraform must live in its own directory (never `infra/preview/`).
- It must use its own local (or remote) state — never the same `.tfstate` file, never the same backend configuration as preview.
- It must hardcode its own `subscription_id`/`tenant_id` literals — different values than the ones in this document — following the exact pattern in control #1.
- It must use its own Azure credential/login — never the same `az` session or service principal as preview, so a credential compromise or misconfiguration in one can't reach the other.

## Static permissions vs. dynamic hook — division of labor

| Concern | Mechanism | Why |
|---|---|---|
| A specific file must never be hand-edited | `settings.json` permission deny (control #2) | The risk is tied to a file path, which is knowable statically. |
| A specific subscription/tenant must never be called | Hardcoded provider literal (control #1) | The risk is tied to what Terraform actually calls at runtime — a config-level guarantee, not a review-time one. |
| A command must not run in the wrong directory, or with a live Azure context that's drifted | `PreToolUse` hook (control #3) | The risk is tied to *resolved runtime state* (cwd, live `az account show`, workspace) that no static file permission can see before the command executes. |

Static permissions handle what's knowable from a path alone. The hook exists only for what isn't — and only because that gap couldn't be closed statically.

## Follow-up work

This document was written as part of the same pass that destroyed the preview's infrastructure (`infra/preview/application` then `infra/preview/platform`, each under an explicitly reviewed and approved destroy plan) and extracted `/deploy-preview-env` and `/destroy-preview-env` as reusable skills — see those `SKILL.md` files for the exact orchestrated procedure, which must never skip or auto-approve the plan-review gates described there.
