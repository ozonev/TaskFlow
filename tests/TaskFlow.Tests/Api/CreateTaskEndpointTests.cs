using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using TaskFlow.Domain.Projects;
using TaskFlow.Infrastructure;

namespace TaskFlow.Tests.Api;

[Collection(TasksApiCollection.Name)]
public sealed class CreateTaskEndpointTests(TaskFlowApiFactory factory) : IAsyncLifetime
{
    private readonly HttpClient _client = factory.CreateClient();

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    /// <summary>Empties the shared in-memory database so tests can't observe each other's rows.</summary>
    public async ValueTask InitializeAsync()
    {
        using var scope = factory.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<TaskFlowDbContext>();
        await context.Tasks.ExecuteDeleteAsync(Ct);
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

    private static string TasksUrl(Guid projectId) => $"/api/projects/{projectId}/tasks";

    [Fact]
    public async Task Post_WithValidRequest_Returns201WithCreatedTask()
    {
        var projectId = await SeedProjectAsync();
        var before = DateTime.UtcNow;

        var response = await _client.PostAsJsonAsync(
            TasksUrl(projectId),
            new { title = "Write brief", description = "First slice" },
            Ct);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);

        var task = await response.Content.ReadFromJsonAsync<TaskResponseModel>(Ct);
        Assert.NotNull(task);
        Assert.NotEqual(Guid.Empty, task.Id);
        Assert.Equal(projectId, task.ProjectId);
        Assert.Equal("Write brief", task.Title);
        Assert.Equal("First slice", task.Description);
        Assert.Equal("Todo", task.Status);
        Assert.Null(task.DueDate);
        Assert.InRange(task.CreatedAtUtc, before.AddSeconds(-1), DateTime.UtcNow.AddSeconds(1));

        Assert.Equal($"/api/tasks/{task.Id}", response.Headers.Location?.AbsolutePath);
    }

    [Fact]
    public async Task Post_WithoutDescriptionOrDueDate_Returns201WithNullValues()
    {
        var projectId = await SeedProjectAsync();

        var response = await _client.PostAsJsonAsync(TasksUrl(projectId), new { title = "No extras" }, Ct);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);

        var task = await response.Content.ReadFromJsonAsync<TaskResponseModel>(Ct);
        Assert.NotNull(task);
        Assert.Null(task.Description);
        Assert.Null(task.DueDate);
    }

    [Fact]
    public async Task Post_WithDueDate_Returns201WithDueDate()
    {
        var projectId = await SeedProjectAsync();
        var dueDate = new DateTime(2026, 12, 1, 0, 0, 0, DateTimeKind.Utc);

        var response = await _client.PostAsJsonAsync(TasksUrl(projectId), new { title = "Ship it", dueDate }, Ct);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);

        var task = await response.Content.ReadFromJsonAsync<TaskResponseModel>(Ct);
        Assert.NotNull(task);
        Assert.Equal(dueDate, task.DueDate);
    }

    [Fact]
    public async Task Post_WithValidRequest_PersistsTask()
    {
        var projectId = await SeedProjectAsync();

        var response = await _client.PostAsJsonAsync(
            TasksUrl(projectId),
            new { title = "  Persisted  ", description = "  Trimmed  " },
            Ct);
        response.EnsureSuccessStatusCode();

        var created = await response.Content.ReadFromJsonAsync<TaskResponseModel>(Ct);
        Assert.NotNull(created);

        using var scope = factory.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<TaskFlowDbContext>();

        var persisted = await context.Tasks.AsNoTracking()
            .SingleOrDefaultAsync(t => t.Id == created.Id, Ct);

        Assert.NotNull(persisted);
        Assert.Equal(projectId, persisted.ProjectId);
        Assert.Equal("Persisted", persisted.Title);
        Assert.Equal("Trimmed", persisted.Description);
        Assert.Equal(DateTimeKind.Utc, persisted.CreatedAtUtc.Kind);
    }

    [Fact]
    public async Task Post_WithUnknownProjectId_Returns404()
    {
        var response = await _client.PostAsJsonAsync(
            TasksUrl(Guid.CreateVersion7()),
            new { title = "Orphan task" },
            Ct);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Post_WithoutTitle_Returns400()
    {
        var projectId = await SeedProjectAsync();

        var response = await _client.PostAsJsonAsync(TasksUrl(projectId), new { description = "orphan" }, Ct);

        await AssertValidationProblemAsync(response, "title");
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public async Task Post_WithBlankTitle_Returns400(string title)
    {
        var projectId = await SeedProjectAsync();

        var response = await _client.PostAsJsonAsync(TasksUrl(projectId), new { title }, Ct);

        await AssertValidationProblemAsync(response, "title");
    }

    [Fact]
    public async Task Post_WithTitleOverMaxLength_Returns400()
    {
        var projectId = await SeedProjectAsync();

        var response = await _client.PostAsJsonAsync(TasksUrl(projectId), new { title = new string('a', 201) }, Ct);

        await AssertValidationProblemAsync(response, "title");
    }

    [Fact]
    public async Task Post_WithTitleAtMaxLength_Returns201()
    {
        var projectId = await SeedProjectAsync();

        var response = await _client.PostAsJsonAsync(TasksUrl(projectId), new { title = new string('a', 200) }, Ct);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
    }

    [Fact]
    public async Task Post_WithDescriptionOverMaxLength_Returns400()
    {
        var projectId = await SeedProjectAsync();

        var response = await _client.PostAsJsonAsync(
            TasksUrl(projectId),
            new { title = "Valid", description = new string('a', 2001) },
            Ct);

        await AssertValidationProblemAsync(response, "description");
    }

    [Fact]
    public async Task Post_WithDescriptionAtMaxLength_Returns201()
    {
        var projectId = await SeedProjectAsync();

        var response = await _client.PostAsJsonAsync(
            TasksUrl(projectId),
            new { title = "Valid", description = new string('a', 2000) },
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

    private sealed record TaskResponseModel(
        Guid Id,
        Guid ProjectId,
        string Title,
        string? Description,
        string Status,
        DateTime? DueDate,
        DateTime CreatedAtUtc);
}
