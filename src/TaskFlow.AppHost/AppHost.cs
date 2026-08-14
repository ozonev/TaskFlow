var builder = DistributedApplication.CreateBuilder(args);

var postgres = builder.AddPostgres("postgres")
    .WithLifetime(ContainerLifetime.Persistent);

// Resource name "DefaultConnection" (not the Postgres database name "taskflow") is what makes
// WithReference below inject ConnectionStrings__DefaultConnection -- the exact config key
// Program.cs already reads via GetConnectionString("DefaultConnection").
var db = postgres.AddDatabase("DefaultConnection", databaseName: "taskflow");

var api = builder.AddProject<Projects.TaskFlow_Api>("api")
    .WithReference(db)
    .WithEnvironment("DatabaseProvider", "Postgres")
    .WaitFor(db)
    .WithHttpHealthCheck("/health");

// AddViteApp auto-registers its own "http" endpoint and assigns it a random port by default; you
// can't call WithHttpEndpoint() on it (duplicate-endpoint error), but WithEndpoint() *mutates* that
// existing endpoint. Pinning it to 5273 (IsProxied: false so the port is Vite's real listening
// port, not an Aspire-proxied one) keeps it matching the CORS origin already allowlisted in
// appsettings.Development.json (Cors:AllowedOrigins) -- no CORS/env wiring needed on the Api side.
builder.AddViteApp("web", "../TaskFlow.Web")
    .WithEndpoint("http", e =>
    {
        e.Port = 5273;
        e.IsProxied = false;
    })
    .WithReference(api)
    // httpClient.ts builds every request as `${baseUrl}${path}` with unprefixed paths like
    // "/projects" -- baseUrl must itself end in "/api" (see the checked-in .env.development),
    // not just the bare Api origin GetEndpoint("http") returns on its own.
    .WithEnvironment("VITE_API_BASE_URL", ReferenceExpression.Create($"{api.GetEndpoint("http")}/api"))
    .WaitFor(api);

builder.Build().Run();
