using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using TaskFlow.Domain.Projects;
using TaskFlow.Infrastructure;

namespace TaskFlow.Tests.Api;

[Collection(LabelsApiCollection.Name)]
public sealed class CreateLabelEndpointTests(TaskFlowApiFactory factory) : IAsyncLifetime
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

    private static string LabelsUrl(Guid projectId) => $"/api/projects/{projectId}/labels";

    [Fact]
    public async Task Post_WithValidRequest_Returns201WithCreatedLabel()
    {
        var projectId = await SeedProjectAsync();
        var before = DateTime.UtcNow;

        var response = await _client.PostAsJsonAsync(LabelsUrl(projectId), new { name = "Urgent" }, Ct);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);

        var label = await response.Content.ReadFromJsonAsync<LabelResponseModel>(Ct);
        Assert.NotNull(label);
        Assert.NotEqual(Guid.Empty, label.Id);
        Assert.Equal(projectId, label.ProjectId);
        Assert.Equal("Urgent", label.Name);
        Assert.InRange(label.CreatedAtUtc, before.AddSeconds(-1), DateTime.UtcNow.AddSeconds(1));

        Assert.Equal($"{LabelsUrl(projectId)}/{label.Id}", response.Headers.Location?.OriginalString);
    }

    [Fact]
    public async Task Post_WithUnknownProjectId_Returns404()
    {
        var response = await _client.PostAsJsonAsync(LabelsUrl(Guid.CreateVersion7()), new { name = "Urgent" }, Ct);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public async Task Post_WithBlankName_Returns400(string name)
    {
        var projectId = await SeedProjectAsync();

        var response = await _client.PostAsJsonAsync(LabelsUrl(projectId), new { name }, Ct);

        await AssertValidationProblemAsync(response, "name");
    }

    [Fact]
    public async Task Post_WithNameOverMaxLength_Returns400()
    {
        var projectId = await SeedProjectAsync();

        var response = await _client.PostAsJsonAsync(LabelsUrl(projectId), new { name = new string('a', 51) }, Ct);

        await AssertValidationProblemAsync(response, "name");
    }

    [Fact]
    public async Task Post_WithDuplicateName_Returns400()
    {
        var projectId = await SeedProjectAsync();
        await _client.PostAsJsonAsync(LabelsUrl(projectId), new { name = "Urgent" }, Ct);

        var response = await _client.PostAsJsonAsync(LabelsUrl(projectId), new { name = "Urgent" }, Ct);

        await AssertValidationProblemAsync(response, "name");
    }

    [Fact]
    public async Task Post_WithDuplicateNameDifferentCase_Returns400()
    {
        var projectId = await SeedProjectAsync();
        await _client.PostAsJsonAsync(LabelsUrl(projectId), new { name = "Urgent" }, Ct);

        var response = await _client.PostAsJsonAsync(LabelsUrl(projectId), new { name = "URGENT" }, Ct);

        await AssertValidationProblemAsync(response, "name");
    }

    [Fact]
    public async Task Post_WithSameNameInDifferentProjects_Returns201ForBoth()
    {
        var projectA = await SeedProjectAsync();
        var projectB = await SeedProjectAsync();
        await _client.PostAsJsonAsync(LabelsUrl(projectA), new { name = "Urgent" }, Ct);

        var response = await _client.PostAsJsonAsync(LabelsUrl(projectB), new { name = "Urgent" }, Ct);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
    }

    private static async Task AssertValidationProblemAsync(HttpResponseMessage response, string expectedMember)
    {
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);

        var problem = await response.Content.ReadFromJsonAsync<HttpValidationProblemDetails>(Ct);
        Assert.NotNull(problem);
        Assert.Contains(problem.Errors.Keys, key => key.Equals(expectedMember, StringComparison.OrdinalIgnoreCase));
    }

    private sealed record LabelResponseModel(Guid Id, Guid ProjectId, string Name, DateTime CreatedAtUtc);
}
