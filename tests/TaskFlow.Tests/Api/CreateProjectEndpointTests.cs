using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using TaskFlow.Infrastructure;

namespace TaskFlow.Tests.Api;

[Collection(ProjectsApiCollection.Name)]
public sealed class CreateProjectEndpointTests(TaskFlowApiFactory factory) : IAsyncLifetime
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
    public async Task Post_WithValidRequest_Returns201WithCreatedProject()
    {
        var before = DateTime.UtcNow;

        var response = await _client.PostAsJsonAsync(Url, new { name = "Apollo", description = "First slice" }, Ct);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);

        var project = await response.Content.ReadFromJsonAsync<ProjectResponseModel>(Ct);
        Assert.NotNull(project);
        Assert.NotEqual(Guid.Empty, project.Id);
        Assert.Equal("Apollo", project.Name);
        Assert.Equal("First slice", project.Description);
        Assert.InRange(project.CreatedAtUtc, before.AddSeconds(-1), DateTime.UtcNow.AddSeconds(1));

        Assert.Equal($"{Url}/{project.Id}", response.Headers.Location?.PathAndQuery);
    }

    [Fact]
    public async Task Post_WithoutDescription_Returns201WithNullDescription()
    {
        var response = await _client.PostAsJsonAsync(Url, new { name = "No description" }, Ct);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);

        var project = await response.Content.ReadFromJsonAsync<ProjectResponseModel>(Ct);
        Assert.NotNull(project);
        Assert.Null(project.Description);
    }

    [Fact]
    public async Task Post_WithValidRequest_PersistsProject()
    {
        var response = await _client.PostAsJsonAsync(
            Url,
            new { name = "  Persisted  ", description = "  Trimmed  " },
            Ct);
        response.EnsureSuccessStatusCode();

        var created = await response.Content.ReadFromJsonAsync<ProjectResponseModel>(Ct);
        Assert.NotNull(created);

        using var scope = factory.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<TaskFlowDbContext>();

        var persisted = await context.Projects.AsNoTracking()
            .SingleOrDefaultAsync(p => p.Id == created.Id, Ct);

        Assert.NotNull(persisted);
        Assert.Equal("Persisted", persisted.Name);
        Assert.Equal("Trimmed", persisted.Description);
        Assert.Equal(DateTimeKind.Utc, persisted.CreatedAtUtc.Kind);
    }

    [Fact]
    public async Task Post_WithNameAtMaxLengthPlusWhitespace_Returns201()
    {
        var response = await _client.PostAsJsonAsync(Url, new { name = new string('a', 100) + "  " }, Ct);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
    }

    [Fact]
    public async Task Post_WithoutName_Returns400()
    {
        var response = await _client.PostAsJsonAsync(Url, new { description = "orphan" }, Ct);

        await AssertValidationProblemAsync(response, "name");
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public async Task Post_WithBlankName_Returns400(string name)
    {
        var response = await _client.PostAsJsonAsync(Url, new { name }, Ct);

        await AssertValidationProblemAsync(response, "name");
    }

    [Fact]
    public async Task Post_WithNameOverMaxLength_Returns400()
    {
        var response = await _client.PostAsJsonAsync(Url, new { name = new string('a', 101) }, Ct);

        await AssertValidationProblemAsync(response, "name");
    }

    [Fact]
    public async Task Post_WithNameAtMaxLength_Returns201()
    {
        var response = await _client.PostAsJsonAsync(Url, new { name = new string('a', 100) }, Ct);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
    }

    [Fact]
    public async Task Post_WithDescriptionOverMaxLength_Returns400()
    {
        var response = await _client.PostAsJsonAsync(
            Url,
            new { name = "Valid", description = new string('a', 501) },
            Ct);

        await AssertValidationProblemAsync(response, "description");
    }

    [Fact]
    public async Task Post_WithDescriptionAtMaxLength_Returns201()
    {
        var response = await _client.PostAsJsonAsync(
            Url,
            new { name = "Valid", description = new string('a', 500) },
            Ct);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
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
