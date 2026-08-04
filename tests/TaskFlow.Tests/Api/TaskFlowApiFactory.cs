using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using TaskFlow.Infrastructure;

namespace TaskFlow.Tests.Api;

/// <summary>
/// Hosts the real API against a SQLite in-memory database. The connection is opened here and
/// held for the fixture's lifetime because SQLite discards an in-memory database as soon as its
/// last connection closes.
/// </summary>
public sealed class TaskFlowApiFactory : WebApplicationFactory<Program>, IAsyncLifetime
{
    private readonly SqliteConnection _connection = new("DataSource=:memory:");

    public async ValueTask InitializeAsync()
    {
        var cancellationToken = TestContext.Current.CancellationToken;

        await _connection.OpenAsync(cancellationToken);

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
        builder.UseSetting("ConnectionStrings:DefaultConnection", "DataSource=:memory:");

        builder.ConfigureTestServices(services =>
        {
            services.RemoveAll<IDbContextOptionsConfiguration<TaskFlowDbContext>>();
            services.RemoveAll<DbContextOptions<TaskFlowDbContext>>();
            services.RemoveAll<DbContextOptions>();
            services.RemoveAll<TaskFlowDbContext>();

            services.AddDbContext<TaskFlowDbContext>(options => options.UseSqlite(_connection));
        });
    }

    public override async ValueTask DisposeAsync()
    {
        await base.DisposeAsync();
        await _connection.DisposeAsync();
    }
}
