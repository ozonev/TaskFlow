using DotNet.Testcontainers.Builders;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using TaskFlow.Infrastructure;
using TaskFlow.Infrastructure.Migrations.Postgres;
using Testcontainers.PostgreSql;

namespace TaskFlow.Tests.Api;

/// <summary>
/// Hosts the real API against a real PostgreSQL container, so tests can exercise genuine
/// connection-pool/concurrency behavior the SQLite fixture's single held-open connection cannot.
/// </summary>
public sealed class TaskFlowPostgresApiFactory : WebApplicationFactory<Program>, IAsyncLifetime
{
    private readonly PostgreSqlContainer _container;

    private string _connectionString = string.Empty;

    public TaskFlowPostgresApiFactory()
    {
        try
        {
            // Build() validates Docker reachability synchronously, so a not-running engine
            // surfaces here rather than later in InitializeAsync's StartAsync call.
            _container = new PostgreSqlBuilder("postgres:16-alpine").Build();
        }
        catch (DockerUnavailableException ex)
        {
            // Fail with plain instructions instead of surfacing Testcontainers' raw
            // DockerUnavailableException/AggregateException stack trace.
            throw new InvalidOperationException(
                "Postgres-tagged tests need a local Docker engine running (e.g. Rancher Desktop or " +
                "Docker Desktop). Start it, wait for `docker info` to show a Server section, then " +
                "re-run: dotnet test --filter-trait \"Category=Postgres\"", ex);
        }
    }

    public async ValueTask InitializeAsync()
    {
        var cancellationToken = TestContext.Current.CancellationToken;

        // Must finish before the first access to Services below: ConfigureWebHost reads this
        // field synchronously once WebApplicationFactory lazily builds the host on that access.
        await _container.StartAsync(cancellationToken);
        _connectionString = _container.GetConnectionString();

        // Migrate rather than EnsureCreated, so each run also proves the committed migration applies.
        using var scope = Services.CreateScope();
        await scope.ServiceProvider.GetRequiredService<TaskFlowDbContext>()
            .Database.MigrateAsync(cancellationToken);
    }

    public IServiceScope CreateScope() => Services.CreateScope();

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        // Not Development: keeps appsettings.Development.json and the startup migration out of tests.
        builder.UseEnvironment("Testing");

        // Satisfies the startup connection-string check; the registration below replaces it anyway.
        builder.UseSetting("ConnectionStrings:DefaultConnection", "Host=localhost");

        builder.ConfigureTestServices(services =>
        {
            TaskFlowDbContextTestRegistration.RemoveDefaultRegistration(services);

            services.AddDbContext<TaskFlowDbContext>(options => options.UseNpgsql(
                _connectionString,
                npgsql => npgsql.MigrationsAssembly(PostgresMigrationsAssembly.Name)));
        });
    }

    public override async ValueTask DisposeAsync()
    {
        await base.DisposeAsync();
        await _container.DisposeAsync();
    }
}
