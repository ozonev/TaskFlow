using Microsoft.EntityFrameworkCore;
using TaskFlow.Application.Abstractions;
using TaskFlow.Application.Comments;
using TaskFlow.Application.Projects;
using TaskFlow.Application.Tasks;
using TaskFlow.Infrastructure;
using TaskFlow.Infrastructure.Migrations.Postgres;
using TaskFlow.Infrastructure.Persistence.Repositories;

var builder = WebApplication.CreateBuilder(args);

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

builder.Services.AddScoped<ITaskRepository, TaskRepository>();
builder.Services.AddScoped<CreateTaskHandler>();

builder.Services.AddScoped<ICommentRepository, CommentRepository>();
builder.Services.AddScoped<CreateCommentHandler>();
builder.Services.AddScoped<GetCommentsByTaskIdHandler>();

builder.Services.AddHealthChecks();

var app = builder.Build();

app.UseExceptionHandler();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();

    using var scope = app.Services.CreateScope();
    await scope.ServiceProvider.GetRequiredService<TaskFlowDbContext>().Database.MigrateAsync();
}

app.UseHttpsRedirection();

app.MapHealthChecks("/health");

app.MapControllers();

app.Run();

// Exposes the implicit entry point to WebApplicationFactory<Program> in the tests.
public partial class Program;
