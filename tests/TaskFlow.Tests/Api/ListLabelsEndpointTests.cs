using System.Net;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using TaskFlow.Domain.Labels;
using TaskFlow.Domain.Projects;
using TaskFlow.Infrastructure;

namespace TaskFlow.Tests.Api;

[Collection(LabelsApiCollection.Name)]
public sealed class ListLabelsEndpointTests(TaskFlowApiFactory factory) : IAsyncLifetime
{
    private readonly HttpClient _client = factory.CreateClient();

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    /// <summary>Empties the shared in-memory database so tests can't observe each other's rows.</summary>
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

    private async Task SeedLabelAsync(Guid projectId, string name)
    {
        using var scope = factory.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<TaskFlowDbContext>();
        context.Labels.Add(Label.Create(projectId, name));
        await context.SaveChangesAsync(Ct);
    }

    private static string LabelsUrl(Guid projectId) => $"/api/projects/{projectId}/labels";

    [Fact]
    public async Task Get_WithNoLabels_Returns200WithEmptyArray()
    {
        var projectId = await SeedProjectAsync();

        var response = await _client.GetAsync(LabelsUrl(projectId), Ct);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var labels = await response.Content.ReadFromJsonAsync<LabelResponseModel[]>(Ct);
        Assert.Empty(labels!);
    }

    [Fact]
    public async Task Get_ReturnsOnlyLabelsForThatProject()
    {
        var projectA = await SeedProjectAsync();
        var projectB = await SeedProjectAsync();
        await SeedLabelAsync(projectA, "Urgent");
        await SeedLabelAsync(projectB, "Blocked");

        var response = await _client.GetAsync(LabelsUrl(projectA), Ct);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var labels = await response.Content.ReadFromJsonAsync<LabelResponseModel[]>(Ct);
        var label = Assert.Single(labels!);
        Assert.Equal("Urgent", label.Name);
    }

    [Fact]
    public async Task Get_WithUnknownProjectId_Returns404()
    {
        var response = await _client.GetAsync(LabelsUrl(Guid.CreateVersion7()), Ct);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    private sealed record LabelResponseModel(Guid Id, Guid ProjectId, string Name, DateTime CreatedAtUtc);
}
