using System.Net;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using TaskFlow.Infrastructure;

namespace TaskFlow.Tests.Api;

/// <summary>
/// Proves genuine concurrent-connection behavior that <see cref="TaskFlowApiFactory"/> cannot:
/// that fixture binds every request to one held-open SQLite connection, serializing all access
/// by construction, so it can never exercise a real connection pool under concurrent load.
/// </summary>
[Trait("Category", "Postgres")]
[Collection(PostgresApiCollection.Name)]
public sealed class ConcurrentProjectCreationTests(TaskFlowPostgresApiFactory factory) : IAsyncLifetime
{
    private const string Url = "/api/projects";
    private const int ConcurrentRequestCount = 20;

    private readonly HttpClient _client = factory.CreateClient();

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    public async ValueTask InitializeAsync()
    {
        using var scope = factory.CreateScope();
        await scope.ServiceProvider.GetRequiredService<TaskFlowDbContext>()
            .Projects.ExecuteDeleteAsync(Ct);
    }

    public ValueTask DisposeAsync() => ValueTask.CompletedTask;

    [Fact]
    public async Task ConcurrentPosts_AllSucceedAndPersistDistinctRows()
    {
        var tasks = Enumerable.Range(0, ConcurrentRequestCount)
            .Select(i => _client.PostAsJsonAsync(Url, new { name = $"Concurrent {i}" }, Ct))
            .ToArray();

        var responses = await Task.WhenAll(tasks);

        Assert.All(responses, response => Assert.Equal(HttpStatusCode.Created, response.StatusCode));

        var projects = await Task.WhenAll(
            responses.Select(response => response.Content.ReadFromJsonAsync<ProjectResponseModel>(Ct)));

        var ids = projects.Select(project => project!.Id).ToArray();
        Assert.Equal(ConcurrentRequestCount, ids.Distinct().Count());

        using var scope = factory.CreateScope();
        var persistedCount = await scope.ServiceProvider.GetRequiredService<TaskFlowDbContext>()
            .Projects.CountAsync(Ct);
        Assert.Equal(ConcurrentRequestCount, persistedCount);
    }

    private sealed record ProjectResponseModel(Guid Id, string Name, string? Description, DateTime CreatedAtUtc);
}
