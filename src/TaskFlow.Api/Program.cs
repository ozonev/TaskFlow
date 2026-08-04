using Microsoft.EntityFrameworkCore;
using TaskFlow.Application.Abstractions;
using TaskFlow.Application.Projects;
using TaskFlow.Infrastructure;
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

builder.Services.AddDbContext<TaskFlowDbContext>(options => options.UseSqlite(connectionString));

builder.Services.AddScoped<IProjectRepository, ProjectRepository>();
builder.Services.AddScoped<CreateProjectHandler>();

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
