---
description: Deploys the TaskFlow Azure Container Apps preview environment (infra/preview/platform then infra/preview/application) with an immutable image tag, under the guardrails in docs/architecture/preview-guardrails.md. Use only when the user explicitly asks to deploy/stand up/apply the preview environment. Do not use for any other Azure or Terraform work, and never invoke this without an explicit user request.
disable-model-invocation: true
---

Do not use for: production deployments, any Terraform root other than `infra/preview/platform`/`infra/preview/application`, or any request that doesn't explicitly ask to deploy/stand up this specific preview.

Workflow:
1. Confirm the active `az` context (`az account show`) matches the subscription/tenant hardcoded in `infra/preview/{platform,application}/providers.tf`. If it doesn't, stop — do not proceed under a mismatched context even if a later step would also catch it.
2. One-time prerequisite check: `az provider show -n Microsoft.App --query registrationState -o tsv`. If not `Registered`, run `az provider register -n Microsoft.App --wait` before continuing.
3. `terraform -chdir=infra/preview/platform init -input=false`, then `terraform -chdir=infra/preview/platform plan -out=platform.tfplan -input=false`.
4. Summarize the plan (resources to add/change/destroy, subscription/region, public exposure, identity/role assignments, storage/database configuration, cost drivers, anything unexpected) and get explicit approval via AskUserQuestion before applying. Never use `-auto-approve`. Never skip this even if the plan looks identical to a previous run.
5. `terraform -chdir=infra/preview/platform apply "platform.tfplan"`.
6. Budget alert (required, external to Claude Code — see `docs/architecture/preview-guardrails.md` §5): read `platform`'s `resource_group_name` output and the `owner`/`expiry-date` tag values, then run
   ```
   az consumption budget create \
     --budget-name budget-taskflow-preview \
     --resource-group <resource_group_name> \
     --amount <nominal-monthly-amount> \
     --category cost \
     --time-grain monthly \
     --start-date <today> \
     --end-date <expiry-date tag value> \
     --notifications '{"Actual_GreaterThan_90_Percent": {"enabled": true, "operator": "GreaterThan", "threshold": 90, "contactEmails": ["<owner tag email>"]}}'
   ```
   Ask the user for the nominal monthly amount if not already known; don't guess a number and silently apply it.
7. Build and push an immutable-tagged image: from the repo root, confirm the working tree is clean and get the current commit SHA (`git rev-parse HEAD`); if the tree is dirty, tell the user and ask whether to proceed anyway (the tag would then not accurately represent what's built). Then:
   ```
   az acr build --registry <acr-name-from-platform-output> --subscription <pinned-subscription-id> --image taskflow-api:<git-sha> .
   ```
   Never tag as `latest`. Never let this command's `--subscription`/`--registry` be inferred — always pass the exact values read from `platform`'s outputs and the pinned subscription literal.
8. Record the built reference in `infra/preview/application/image.auto.tfvars` (`image_tag = "<login-server>/taskflow-api:<git-sha>"`) — Terraform auto-loads this, and it's already git-ignored.
9. `terraform -chdir=infra/preview/application init -input=false`, then `terraform -chdir=infra/preview/application plan -out=application.tfplan -input=false`.
10. Summarize this plan the same way as step 4 and get a second explicit approval via AskUserQuestion — this is a separate gate from step 4, not a rubber stamp because step 4 was already approved.
11. `terraform -chdir=infra/preview/application apply "application.tfplan"`.
12. Poll the Container App's `container_app_fqdn` output at `/health` until it returns 200 (cold start + first-boot migration can take a short while), then hit a real API endpoint (e.g. `GET /api/projects`) to confirm the app is actually served against the real database, not just that the process started.

Rules:
- Never skip or auto-approve either plan-review gate (steps 4 and 10). Both must go through AskUserQuestion with a real summary, every time, even on a re-run.
- Never apply anything other than the exact saved `.tfplan` file just reviewed — no re-planning immediately before apply, no `-auto-approve`.
- Never tag an image `latest`, and never let the target subscription/registry be inferred from ambient context — always pass the pinned literal/output values explicitly.
- If the `PreToolUse` hook (`validate-terraform-target.ps1`) blocks a command, treat that as a hard stop and investigate why — never route around it by changing directory tricks or re-authenticating to a different context to make it pass.
- If any step's actual output doesn't match what's described here (extra resources, unexpected destroys, a plan that isn't a clean create), stop and surface it rather than proceeding.
