using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using TaskFlow.Domain.Projects;
using TaskFlow.Infrastructure;

namespace TaskFlow.Tests.Api;

[Collection(ProjectsApiCollection.Name)]
public sealed class UpdateProjectEndpointTests(TaskFlowApiFactory factory) : IAsyncLifetime
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
    public async Task Patch_WithExistingId_Returns200AndUpdatesFields()
    {
        var seeded = await SeedAsync("Apollo", "First slice");

        var response = await _client.PatchAsJsonAsync(
            $"{Url}/{seeded.Id}",
            new { name = "Gemini", description = "Second slice" },
            Ct);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var project = await response.Content.ReadFromJsonAsync<ProjectResponseModel>(Ct);
        Assert.NotNull(project);
        Assert.Equal(seeded.Id, project.Id);
        Assert.Equal("Gemini", project.Name);
        Assert.Equal("Second slice", project.Description);

        using var scope = factory.CreateScope();
        var persisted = await scope.ServiceProvider.GetRequiredService<TaskFlowDbContext>()
            .Projects.AsNoTracking().SingleAsync(p => p.Id == seeded.Id, Ct);
        Assert.Equal("Gemini", persisted.Name);
        Assert.Equal("Second slice", persisted.Description);
    }

    [Fact]
    public async Task Patch_WithOnlyName_LeavesDescriptionUnchanged()
    {
        var seeded = await SeedAsync("Apollo", "First slice");

        var response = await _client.PatchAsJsonAsync($"{Url}/{seeded.Id}", new { name = "Gemini" }, Ct);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var project = await response.Content.ReadFromJsonAsync<ProjectResponseModel>(Ct);
        Assert.NotNull(project);
        Assert.Equal("Gemini", project.Name);
        Assert.Equal("First slice", project.Description);
    }

    [Fact]
    public async Task Patch_WithOnlyDescription_LeavesNameUnchanged()
    {
        var seeded = await SeedAsync("Apollo", "First slice");

        var response = await _client.PatchAsJsonAsync(
            $"{Url}/{seeded.Id}",
            new { description = "Second slice" },
            Ct);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var project = await response.Content.ReadFromJsonAsync<ProjectResponseModel>(Ct);
        Assert.NotNull(project);
        Assert.Equal("Apollo", project.Name);
        Assert.Equal("Second slice", project.Description);
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public async Task Patch_WithBlankDescription_ClearsDescription(string description)
    {
        var seeded = await SeedAsync("Apollo", "First slice");

        var response = await _client.PatchAsJsonAsync($"{Url}/{seeded.Id}", new { description }, Ct);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var project = await response.Content.ReadFromJsonAsync<ProjectResponseModel>(Ct);
        Assert.NotNull(project);
        Assert.Null(project.Description);
    }

    [Fact]
    public async Task Patch_WithNeitherFieldProvided_Returns200WithProjectUnchanged()
    {
        var seeded = await SeedAsync("Apollo", "First slice");

        var response = await _client.PatchAsJsonAsync($"{Url}/{seeded.Id}", new { }, Ct);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var project = await response.Content.ReadFromJsonAsync<ProjectResponseModel>(Ct);
        Assert.NotNull(project);
        Assert.Equal("Apollo", project.Name);
        Assert.Equal("First slice", project.Description);
    }

    [Fact]
    public async Task Patch_WithUnknownId_Returns404()
    {
        var response = await _client.PatchAsJsonAsync(
            $"{Url}/{Guid.CreateVersion7()}",
            new { name = "Gemini" },
            Ct);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Patch_WithNameOverMaxLength_Returns400()
    {
        var seeded = await SeedAsync("Apollo", "First slice");

        var response = await _client.PatchAsJsonAsync(
            $"{Url}/{seeded.Id}",
            new { name = new string('a', 101) },
            Ct);

        await AssertValidationProblemAsync(response, "name");
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public async Task Patch_WithBlankNameProvided_Returns400(string name)
    {
        var seeded = await SeedAsync("Apollo", "First slice");

        var response = await _client.PatchAsJsonAsync($"{Url}/{seeded.Id}", new { name }, Ct);

        await AssertValidationProblemAsync(response, "name");
    }

    [Fact]
    public async Task Patch_WithDescriptionOverMaxLength_Returns400()
    {
        var seeded = await SeedAsync("Apollo", "First slice");

        var response = await _client.PatchAsJsonAsync(
            $"{Url}/{seeded.Id}",
            new { description = new string('a', 501) },
            Ct);

        await AssertValidationProblemAsync(response, "description");
    }

    private async Task<Project> SeedAsync(string name, string? description)
    {
        var project = Project.Create(name, description);

        using var scope = factory.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<TaskFlowDbContext>();
        context.Projects.Add(project);
        await context.SaveChangesAsync(Ct);

        return project;
    }

    private static async Task AssertValidationProblemAsync(HttpResponseMessage response, string expectedMember)
    {
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);

        var problem = await response.Content.ReadFromJsonAsync<HttpValidationProblemDetails>(Ct);
        Assert.NotNull(problem);
        Assert.Contains(problem.Errors.Keys, key => key.Equals(expectedMember, StringComparison.OrdinalIgnoreCase));
    }

    private sealed record ProjectResponseModel(Guid Id, string Name, string? Description, DateTime CreatedAtUtc);
}
