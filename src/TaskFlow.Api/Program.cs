using Microsoft.EntityFrameworkCore;
using TaskFlow.Application.Abstractions;
using TaskFlow.Application.AuditLogs;
using TaskFlow.Application.Comments;
using TaskFlow.Application.Labels;
using TaskFlow.Application.Projects;
using TaskFlow.Application.Tasks;
using TaskFlow.Infrastructure;
using TaskFlow.Infrastructure.Migrations.Postgres;
using TaskFlow.Infrastructure.Persistence;
using TaskFlow.Infrastructure.Persistence.Repositories;

var builder = WebApplication.CreateBuilder(args);

// Wires OpenTelemetry/OTLP export, service discovery, and resilient HttpClient defaults so the
// Aspire dashboard (src/TaskFlow.AppHost) shows logs/traces. Deliberately not paired with
// MapDefaultEndpoints() below -- this app already maps its own /health unconditionally, and the
// template's MapDefaultEndpoints() would remap /health (plus /alive) a second time.
builder.AddServiceDefaults();

builder.Services.AddOpenApi();

builder.Services.AddControllers();

builder.Services.AddProblemDetails();

// Fail at startup rather than letting UseSqlite(null) open an anonymous temp database,
// which starts clean and then 500s on the first query with "no such table".
var connectionString = builder.Configuration.GetConnectionString("DefaultConnection")
    ?? throw new InvalidOperationException(
        "Missing connection string 'ConnectionStrings:DefaultConnection'.");

// Validated eagerly, like the connection-string check above, so a typo'd provider fails at boot
// instead of surfacing as a 500 on the first request that resolves TaskFlowDbContext.
var databaseProvider = builder.Configuration["DatabaseProvider"] ?? "Sqlite";
if (databaseProvider is not ("Sqlite" or "Postgres"))
{
    throw new InvalidOperationException(
        $"Unknown DatabaseProvider '{databaseProvider}'. Expected 'Sqlite' or 'Postgres'.");
}

builder.Services.AddDbContext<TaskFlowDbContext>(options =>
{
    if (databaseProvider == "Postgres")
    {
        options.UseNpgsql(connectionString,
            npgsql => npgsql.MigrationsAssembly(PostgresMigrationsAssembly.Name));
    }
    else
    {
        options.UseSqlite(connectionString);
    }
});

builder.Services.AddScoped<IProjectRepository, ProjectRepository>();
builder.Services.AddScoped<CreateProjectHandler>();
builder.Services.AddScoped<GetProjectByIdHandler>();
builder.Services.AddScoped<UpdateProjectHandler>();
builder.Services.AddScoped<ListProjectsHandler>();
builder.Services.AddScoped<GetProjectAuditLogHandler>();

builder.Services.AddScoped<ITaskRepository, TaskRepository>();
builder.Services.AddScoped<CreateTaskHandler>();
builder.Services.AddScoped<SearchTasksHandler>();
builder.Services.AddScoped<GetTaskByIdHandler>();
builder.Services.AddScoped<ListProjectTasksHandler>();
builder.Services.AddScoped<AssignTaskLabelHandler>();

builder.Services.AddScoped<ILabelRepository, LabelRepository>();
builder.Services.AddScoped<ITaskLabelRepository, TaskLabelRepository>();
builder.Services.AddScoped<CreateLabelHandler>();
builder.Services.AddScoped<ListLabelsHandler>();

builder.Services.AddScoped<ICommentRepository, CommentRepository>();
builder.Services.AddScoped<CreateCommentHandler>();
builder.Services.AddScoped<GetCommentsByTaskIdHandler>();

builder.Services.AddScoped<IAuditLogRepository, AuditLogRepository>();
builder.Services.AddScoped<GetTaskAuditLogHandler>();

builder.Services.AddScoped<IUnitOfWork, UnitOfWork>();

// Narrow by design: only the origins listed under Cors:AllowedOrigins (Development's frontend
// dev server) are allowed. Production has no such section, so this policy allows nothing there —
// UseCors is also only ever called in Development below, so the middleware isn't even in the
// pipeline outside it.
var corsAllowedOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? [];
builder.Services.AddCors(options =>
    options.AddPolicy("Frontend", policy => policy
        .WithOrigins(corsAllowedOrigins)
        .AllowAnyHeader()
        .AllowAnyMethod()));

var app = builder.Build();

app.UseExceptionHandler();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
    app.UseCors("Frontend");
}

// TASKFLOW_APPLY_MIGRATIONS is a preview-only escape hatch (see docs/architecture/preview-environment.md
// §6) safe only because that environment is pinned to a single replica -- it is NOT the production
// migration strategy.
if (app.Environment.IsDevelopment() || builder.Configuration.GetValue<bool>("TASKFLOW_APPLY_MIGRATIONS"))
{
    using var scope = app.Services.CreateScope();
    await scope.ServiceProvider.GetRequiredService<TaskFlowDbContext>().Database.MigrateAsync();
}

app.UseHttpsRedirection();

app.UseDefaultFiles();
app.UseStaticFiles();

// Explicit rather than relying on WebApplication's implicit auto-insertion: without it, routing
// is inserted very early in the pipeline, so the MapFallbackToFile catch-all below matches every
// non-API request (including real asset files) before UseStaticFiles gets a chance to serve them
// -- StaticFileMiddleware silently skips itself once an endpoint is already matched. Placing this
// after UseStaticFiles guarantees static files are served first.
app.UseRouting();

app.MapHealthChecks("/health");

app.MapControllers();

// Regex-excludes "api" so an unmatched/typo'd API route 404s instead of falling through to the
// SPA shell with a 200 -- MapControllers() above already claims every real API route first.
app.MapFallbackToFile("{*path:regex(^(?!api).*$)}", "index.html");

app.Run();

// Exposes the implicit entry point to WebApplicationFactory<Program> in the tests.
public partial class Program;
