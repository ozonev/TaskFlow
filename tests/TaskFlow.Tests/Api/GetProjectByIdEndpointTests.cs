using System.Net;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using TaskFlow.Domain.Projects;
using TaskFlow.Infrastructure;

namespace TaskFlow.Tests.Api;

[Collection(ProjectsApiCollection.Name)]
public sealed class GetProjectByIdEndpointTests(TaskFlowApiFactory factory) : IAsyncLifetime
{
    private const string Url = "/api/projects";

    private readonly HttpClient _client = factory.CreateClient();

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    /// <summary>Empties the shared in-memory database so tests can't observe each other's rows.</summary>
    public async ValueTask InitializeAsync()
    {
        using var scope = factory.CreateScope();
        await scope.ServiceProvider.GetRequiredService<TaskFlowDbContext>()
            .Projects.ExecuteDeleteAsync(Ct);
    }

    public ValueTask DisposeAsync() => ValueTask.CompletedTask;

    [Fact]
    public async Task Get_WithExistingId_Returns200WithProject()
    {
        var seeded = Project.Create("Apollo", "First slice");

        using (var scope = factory.CreateScope())
        {
            var context = scope.ServiceProvider.GetRequiredService<TaskFlowDbContext>();
            context.Projects.Add(seeded);
            await context.SaveChangesAsync(Ct);
        }

        var response = await _client.GetAsync($"{Url}/{seeded.Id}", Ct);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var project = await response.Content.ReadFromJsonAsync<ProjectResponseModel>(Ct);
        Assert.NotNull(project);
        Assert.Equal(seeded.Id, project.Id);
        Assert.Equal(seeded.Name, project.Name);
        Assert.Equal(seeded.Description, project.Description);
        Assert.Equal(seeded.CreatedAtUtc, project.CreatedAtUtc);
    }

    [Fact]
    public async Task Get_WithUnknownId_Returns404()
    {
        var response = await _client.GetAsync($"{Url}/{Guid.CreateVersion7()}", Ct);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    private sealed record ProjectResponseModel(Guid Id, string Name, string? Description, DateTime CreatedAtUtc);
}
