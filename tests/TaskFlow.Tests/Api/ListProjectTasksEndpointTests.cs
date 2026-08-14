using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using TaskFlow.Domain.Projects;
using TaskFlow.Domain.TaskItems;
using TaskFlow.Infrastructure;

namespace TaskFlow.Tests.Api;

[Collection(TasksApiCollection.Name)]
public sealed class ListProjectTasksEndpointTests(TaskFlowApiFactory factory) : IAsyncLifetime
{
    private static readonly DateTime BaseTimestamp = new(2026, 1, 1, 12, 0, 0, DateTimeKind.Utc);

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

    /// <summary>
    /// Accepts an explicit <paramref name="createdAtUtc"/> rather than relying on consecutive
    /// DateTime.UtcNow reads differing — on a host with a coarse (~15.6 ms) system timer those
    /// would tie, and the Id tie-break is stable but not chronological.
    /// </summary>
    private async Task SeedTaskAsync(Guid projectId, string title, DateTime? createdAtUtc = null)
    {
        using var scope = factory.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<TaskFlowDbContext>();

        var task = TaskItem.Create(projectId, title, null, null);
        context.Tasks.Add(task);
        await context.SaveChangesAsync(Ct);

        if (createdAtUtc is not null)
        {
            await context.Tasks
                .Where(seeded => seeded.Id == task.Id)
                .ExecuteUpdateAsync(
                    setters => setters.SetProperty(seeded => seeded.CreatedAtUtc, createdAtUtc.Value),
                    Ct);
        }
    }

    private static string TasksUrl(Guid projectId) => $"/api/projects/{projectId}/tasks";

    private async Task<TaskListResponseModel> ListAsync(Guid projectId, string query = "")
    {
        var response = await _client.GetAsync(TasksUrl(projectId) + query, Ct);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var body = await response.Content.ReadFromJsonAsync<TaskListResponseModel>(Ct);
        Assert.NotNull(body);

        return body;
    }

    [Fact]
    public async Task List_WithNoTasks_Returns200WithEmptyItemsAndZeroTotals()
    {
        var projectId = await SeedProjectAsync();

        var result = await ListAsync(projectId);

        Assert.Empty(result.Items);
        Assert.Equal(1, result.Page);
        Assert.Equal(20, result.PageSize);
        Assert.Equal(0, result.TotalCount);
        Assert.Equal(0, result.TotalPages);
    }

    /// <summary>
    /// Seeded so insertion order deliberately contradicts chronological order, which proves the
    /// result is sorted by CreatedAtUtc rather than by insertion or rowid.
    /// </summary>
    [Fact]
    public async Task List_ReturnsTasksOrderedByCreatedAtThenId()
    {
        var projectId = await SeedProjectAsync();
        await SeedTaskAsync(projectId, "Third", BaseTimestamp.AddMinutes(2));
        await SeedTaskAsync(projectId, "First", BaseTimestamp);
        await SeedTaskAsync(projectId, "Second", BaseTimestamp.AddMinutes(1));

        var result = await ListAsync(projectId);

        Assert.Equal(["First", "Second", "Third"], result.Items.Select(item => item.Title));
    }

    [Fact]
    public async Task List_DoesNotIncludeTasksFromOtherProjects()
    {
        var projectA = await SeedProjectAsync();
        var projectB = await SeedProjectAsync();
        await SeedTaskAsync(projectA, "On A");
        await SeedTaskAsync(projectB, "On B");

        var result = await ListAsync(projectA);

        var task = Assert.Single(result.Items);
        Assert.Equal("On A", task.Title);
    }

    [Fact]
    public async Task List_WithUnknownProjectId_Returns404()
    {
        var response = await _client.GetAsync(TasksUrl(Guid.CreateVersion7()), Ct);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task List_WithPageAndPageSize_ReturnsRequestedSliceAndCorrectEnvelope()
    {
        var projectId = await SeedProjectAsync();
        for (var i = 0; i < 5; i++)
        {
            await SeedTaskAsync(projectId, $"Task {i}", BaseTimestamp.AddMinutes(i));
        }

        var result = await ListAsync(projectId, "?page=2&pageSize=2");

        Assert.Equal(["Task 2", "Task 3"], result.Items.Select(item => item.Title));
        Assert.Equal(2, result.Page);
        Assert.Equal(2, result.PageSize);
        Assert.Equal(5, result.TotalCount);
        Assert.Equal(3, result.TotalPages);
    }

    [Fact]
    public async Task List_WithPageLessThanOne_Returns400()
    {
        var projectId = await SeedProjectAsync();

        var response = await _client.GetAsync(TasksUrl(projectId) + "?page=0", Ct);

        await AssertValidationProblemAsync(response, "page");
    }

    [Fact]
    public async Task List_WithPageSizeAboveCap_Returns400()
    {
        var projectId = await SeedProjectAsync();

        var response = await _client.GetAsync(TasksUrl(projectId) + "?pageSize=101", Ct);

        await AssertValidationProblemAsync(response, "pageSize");
    }

    private static async Task AssertValidationProblemAsync(HttpResponseMessage response, string expectedMember)
    {
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);

        var problem = await response.Content.ReadFromJsonAsync<HttpValidationProblemDetails>(Ct);
        Assert.NotNull(problem);
        Assert.Contains(problem.Errors.Keys, key => key.Equals(expectedMember, StringComparison.OrdinalIgnoreCase));
    }

    private sealed record TaskListResponseModel(
        TaskResponseModel[] Items, int Page, int PageSize, int TotalCount, int TotalPages);

    private sealed record TaskResponseModel(
        Guid Id,
        Guid ProjectId,
        string Title,
        string? Description,
        string Status,
        DateTime? DueDate,
        DateTime CreatedAtUtc);
}
