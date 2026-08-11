---
description: Implements a Jira ticket in TaskFlow using Jira MCP, project conventions, tests, review, and PR-ready output.
argument-hint: "<Jira ticket id>"
disable-model-invocation: true
---

Ticket:
$ARGUMENTS

Workflow:
1. Use Jira MCP to read the ticket, including comments.
2. Summarize the ticket title, status, and requested behavior.
3. Extract acceptance criteria — check the description, any custom AC field, and comments; don't assume a fixed field holds them.
4. Read CLAUDE.md and the path-scoped rules for the affected area; inspect the existing pattern for the same resource/layer (controller, domain entity, repository, tests) so the steps below are grounded in real conventions, not assumptions.
5. Identify missing or ambiguous requirements.
6. Identify out-of-scope items.
7. Apply the Problem, UX/behavior, Technical boundary, and Decisions completeness gate. A category counts as complete once it's either answered directly by the ticket or resolved by a documented, precedent-backed assumption; record "not affected" only with a reason.
8. Stop and ask for clarification if a material category still can't be marked complete even after applying reasonable assumptions.
9. Use Plan Mode to propose an implementation plan: confirmed acceptance criteria, assumptions, out-of-scope items, the completed gate, affected files, API behavior, persistence changes, test plan, risks, and any open questions that need human approval.
10. Wait for approval before editing.
11. Implement only the approved scope, across whichever layers the change touches — API endpoint, request/response DTOs, application use case, domain model, EF Core persistence — following the same layering `/add-api-feature` uses for non-Jira feature work.
12. Add or update tests for both the success path and the primary failure path.
13. Run dotnet build and dotnet test. If the ticket's acceptance criteria depend on observable HTTP behavior beyond what the test suite proves, use `run-taskflow` to smoke-test the real server.
14. Use dotnet-reviewer to review the diff.
15. Apply the remaining commit-readiness checks: no unrelated files changed, no packages added without approval, and whether the change is security-sensitive enough to recommend /security-review as a follow-up.
16. Compare the final implementation against the original acceptance criteria: satisfied, not satisfied, assumptions implemented, tests that prove each behavior, and known limitations.
17. Return a PR-ready summary. Explicitly list any Jira write-actions that were not taken (no status change, no comment, no link, no worklog) so the ticket's own state is known to be untouched. Recommend follow-up commands for the user to run: /code-review for a deeper adversarial pass, /security-review if flagged, /finish-feature if the team wants its own readiness report on top of this one.

Rules:
- Do not change Jira status unless explicitly asked.
- Do not comment on, link, or log work against the Jira ticket unless explicitly asked — this covers every Jira write tool (comment, transition, link, worklog), not just status changes.
- Never call Confluence or Compass write tools (page, comment, or component creation) — out of scope regardless of what seems contextually helpful.
- Do not modify production secrets or config.
- Do not expand scope beyond the approved acceptance criteria.
- If the ticket is too ambiguous, stop and ask for clarification before editing.
- Do not turn missing information into silent defaults — every assumption used to close a gate must be documented and surfaced in the plan.
