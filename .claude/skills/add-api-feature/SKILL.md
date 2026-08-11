---
description: Implements a TaskFlow .NET backend API feature as a vertical slice from an already provided, concise feature brief. Use for project-local API feature work that needs planning, implementation, tests, and review. Do not use for Jira retrieval, frontend-only work, cloud deployment, or generic repository tasks.
argument-hint: "<feature brief or ticket description>"
disable-model-invocation: true
---

Feature brief or ticket description:
$ARGUMENTS

Use when:
- the input already contains a backend feature brief or accepted requirements
- the change follows TaskFlow's vertical-slice API workflow

Do not use for:
- retrieving or interpreting a Jira ticket
- frontend-only, infrastructure, deployment, or general maintenance work
- a vague idea with no testable behavior

Required output:
- approved plan, implementation, verification evidence, review findings, risks, and a suggested commit message

Workflow:
1. Read CLAUDE.md.
2. Summarize the requested behavior and acceptance criteria.
3. Identify affected projects and files.
4. Propose a small implementation plan.
5. Self-check the plan against the stated acceptance criteria and any explicit review criteria the user gave; call out borderline points instead of silently resolving them.
6. Wait for approval before editing.
7. Implement across the needed layers:
   - API endpoint
   - request/response DTOs
   - application use case/service
   - domain model if needed
   - EF Core persistence in Infrastructure
   - tests
8. Run:
   - dotnet build
   - dotnet test
9. Use Claude Code review tools:
   - git diff
   - /code-review
10. If the feature touches frontend behavior or acceptance criteria require browser validation, suggest invoking /add-e2e-test after implementation.
11. Return:
   - files changed
   - behavior added
   - tests added
   - review findings
   - risks
   - suggested commit message

Rules:
- Follow CLAUDE.md.
- Keep the change small and reviewable.
- If the request is too vague, ask for the missing acceptance criteria before editing.