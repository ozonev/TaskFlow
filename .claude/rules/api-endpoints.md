---
paths:
  - "src/TaskFlow.Api/**"
---

## API endpoint conventions

- MVC controllers, not minimal API — `Program.cs` wires `AddControllers()`/`MapControllers()` and holds no routes. Don't reintroduce `MapGet`/`MapPost` route registrations for business endpoints (`/health` stays a minimal-API `MapHealthChecks`).
- One `ControllerBase` per feature under `Controllers/`, attribute-routed (`[ApiController]`, `[Route("api/<resource>")]`). Dependencies come in through the primary constructor.
- Actions stay thin: call an Application use case, map the result to a response DTO. No business logic or EF Core calls in the action body.
- No `CreatedAtAction`/`CreatedAtRoute` pointing at a GET that doesn't exist yet — it throws at runtime. Use `Created($"/api/<resource>/{id}", response)` until the GET action is added, then switch the POST/PUT action to `CreatedAtAction(nameof(<GetAction>), ...)`.
- Any action targeted via `nameof(...)` for `CreatedAtAction`/`CreatedAtRoute` needs `[ActionName(nameof(<Method>))]` if the method name ends in `Async` — MVC strips the `Async` suffix from the route's action name by default, so `nameof(GetByIdAsync)` won't resolve without it and the request 500s at runtime.

## DTOs & validation

- Never accept or return Domain entities directly over HTTP — always map to/from request/response DTOs at the Api layer.
- Validate request DTOs at the Api boundary before they reach Application code; don't rely on Domain constructors to reject bad request input.
- `[ApiController]` runs DataAnnotations automatically and short-circuits with a 400 `ValidationProblemDetails` before the action body, so actions need no validation code.
- Request DTOs are records with **init accessors, not positional parameters**, so the accessor can normalise (trim) before validation runs. On a positional record MVC requires validation attributes on the constructor parameter and throws `InvalidOperationException` at request time if it finds them on the property — which rules out normalising accessors.
- Length limits on DTOs reference the Domain constants (`[MaxLength(Project.NameMaxLength)]`), never a literal — otherwise lowering a domain limit leaves the API accepting input the domain then rejects with a 500.
- Reuse existing response/Application DTOs (e.g. `ProjectResponse`, `ProjectDto`) across actions on the same resource; only add a new shape when the endpoint's response needs a field set the existing DTO doesn't have — not for stylistic preference.
