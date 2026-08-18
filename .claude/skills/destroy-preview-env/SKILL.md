---
description: Destroys the TaskFlow Azure Container Apps preview environment in the correct order (infra/preview/application before infra/preview/platform), each gated by an explicitly reviewed and approved destroy plan, then verifies via the Azure plugin that nothing cost-bearing remains. Use only when the user explicitly asks to destroy/tear down/decommission the preview environment. Do not use for any other Azure or Terraform work, and never invoke this without an explicit user request.
disable-model-invocation: true
---

Do not use for: production teardown, any Terraform root other than `infra/preview/platform`/`infra/preview/application`, or any request that doesn't explicitly ask to destroy/tear down this specific preview.

Workflow:
1. Confirm the active `az` context (`az account show`) matches the subscription/tenant hardcoded in `infra/preview/{platform,application}/providers.tf`. If it doesn't, stop.
2. `terraform -chdir=infra/preview/application init -input=false`, then `terraform -chdir=infra/preview/application plan -destroy -out=application-destroy.tfplan -input=false`.
3. Summarize the plan (what's being destroyed, subscription/region, anything unexpected — e.g. a plan that isn't a clean "N to destroy, 0 to add/change") and get explicit approval via AskUserQuestion before applying.
4. `terraform -chdir=infra/preview/application apply "application-destroy.tfplan"`.
5. `terraform -chdir=infra/preview/platform init -input=false`, then `terraform -chdir=infra/preview/platform plan -destroy -out=platform-destroy.tfplan -input=false`. This must not run before step 4 completes — platform owns the resource group and identity that application's resources depend on; destroying it first would orphan application's state.
6. Summarize this plan the same way as step 3 and get a second, separate explicit approval via AskUserQuestion.
7. `terraform -chdir=infra/preview/platform apply "platform-destroy.tfplan"`.
8. Verify nothing cost-bearing remains, using the Azure plugin (not only `az` CLI): attempt `mcp__plugin_azure_azure__group_resource_list`/`group_list` for `rg-taskflow-preview`. If it fails (e.g. a credential/tenant mismatch, as seen previously in this project), say so plainly and fall back to `az group show --name rg-taskflow-preview` / `az resource list --resource-group rg-taskflow-preview` — never silently substitute one for the other without telling the user which one actually answered the question.
9. Confirm the resource group either doesn't exist (fully deleted) or exists with zero resources inside it. If anything unexpected remains, report it — don't re-run destroy automatically to "fix" it.

Rules:
- Application must always be destroyed before platform. Never reorder this, even if platform's destroy would otherwise be more convenient to run first.
- Never skip or auto-approve either plan-review gate (steps 3 and 6). Both must go through AskUserQuestion with a real summary, every time.
- Never apply anything other than the exact saved `.tfplan` file just reviewed — no `-auto-approve`.
- If the `PreToolUse` hook (`validate-terraform-target.ps1`) blocks a command, treat that as a hard stop and investigate why — never route around it.
- The final Azure-side check (steps 8–9) is mandatory, not optional — "the two `terraform apply` commands exited 0" is not the same claim as "nothing is still running," and this skill must not conflate them.
