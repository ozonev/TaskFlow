using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using TaskFlow.Domain.Projects;
using TaskFlow.Infrastructure;

namespace TaskFlow.Tests.Api;

/// <summary>
/// Proves the fix for the TOCTOU race in CreateLabelHandler's duplicate-name check under a real
/// concurrent connection pool — something TaskFlowApiFactory's single held-open SQLite connection
/// cannot exercise (see ConcurrentProjectCreationTests). Without the ConcurrentWriteConflictException
/// translation in UnitOfWork, this reliably 500s on Postgres instead of cleanly rejecting every
/// loser as a 400, because a failed statement aborts the rest of that transaction.
/// </summary>
[Trait("Category", "Postgres")]
[Collection(PostgresApiCollection.Name)]
public sealed class ConcurrentDuplicateLabelNameTests(TaskFlowPostgresApiFactory factory) : IAsyncLifetime
{
    private const int ConcurrentRequestCount = 20;

    private readonly HttpClient _client = factory.CreateClient();

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    public async ValueTask InitializeAsync()
    {
        using var scope = factory.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<TaskFlowDbContext>();
        await context.Labels.ExecuteDeleteAsync(Ct);
        await context.Projects.ExecuteDeleteAsync(Ct);
    }

    public ValueTask DisposeAsync() => ValueTask.CompletedTask;

    private async Task<Guid> SeedProjectAsync()
    {
        using var scope = factory.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<TaskFlowDbContext>();
        var project = Project.Create("Apollo", null);
        context.Projects.Add(project);
        await context.SaveChangesAsync(Ct);
        return project.Id;
    }

    [Fact]
    public async Task ConcurrentPostsWithSameName_ExactlyOneSucceeds_RestAre400NotError()
    {
        var projectId = await SeedProjectAsync();
        var url = $"/api/projects/{projectId}/labels";

        var responses = await Task.WhenAll(
            Enumerable.Range(0, ConcurrentRequestCount)
                .Select(_ => _client.PostAsJsonAsync(url, new { name = "Urgent" }, Ct)));

        Assert.Equal(1, responses.Count(r => r.StatusCode == HttpStatusCode.Created));
        Assert.Equal(ConcurrentRequestCount - 1, responses.Count(r => r.StatusCode == HttpStatusCode.BadRequest));
        Assert.DoesNotContain(responses, r => (int)r.StatusCode >= 500);

        var badRequestBodies = await Task.WhenAll(
            responses.Where(r => r.StatusCode == HttpStatusCode.BadRequest)
                .Select(r => r.Content.ReadFromJsonAsync<HttpValidationProblemDetails>(Ct)));
        Assert.All(badRequestBodies, problem =>
        {
            Assert.NotNull(problem);
            Assert.Contains(problem.Errors.Keys, key => key.Equals("name", StringComparison.OrdinalIgnoreCase));
        });

        using var scope = factory.CreateScope();
        var persistedCount = await scope.ServiceProvider.GetRequiredService<TaskFlowDbContext>()
            .Labels.CountAsync(l => l.ProjectId == projectId, Ct);
        Assert.Equal(1, persistedCount);
    }

    /// <summary>
    /// A plain unique index on Name would be exact-case — strictly weaker than ExistsByNameAsync's
    /// case-insensitive pre-check — so two concurrent creates differing only in case would both
    /// pass the pre-check AND both satisfy an exact-case index, silently producing two "duplicate"
    /// labels. Varying the casing across every request here (rather than the identical string the
    /// other test above uses) is what actually exercises LabelConfiguration's NameNormalized shadow
    /// column/index, not just the exact-case case the naive fix would have covered too.
    /// </summary>
    [Fact]
    public async Task ConcurrentPostsWithDifferentlyCasedSameName_ExactlyOneSucceeds_RestAre400NotError()
    {
        var projectId = await SeedProjectAsync();
        var url = $"/api/projects/{projectId}/labels";
        var casings = new[] { "Urgent", "urgent", "URGENT", "uRgEnT" };

        var responses = await Task.WhenAll(
            Enumerable.Range(0, ConcurrentRequestCount)
                .Select(i => _client.PostAsJsonAsync(url, new { name = casings[i % casings.Length] }, Ct)));

        Assert.Equal(1, responses.Count(r => r.StatusCode == HttpStatusCode.Created));
        Assert.Equal(ConcurrentRequestCount - 1, responses.Count(r => r.StatusCode == HttpStatusCode.BadRequest));
        Assert.DoesNotContain(responses, r => (int)r.StatusCode >= 500);

        using var scope = factory.CreateScope();
        var persistedCount = await scope.ServiceProvider.GetRequiredService<TaskFlowDbContext>()
            .Labels.CountAsync(l => l.ProjectId == projectId, Ct);
        Assert.Equal(1, persistedCount);
    }
}
