using System.Net;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using TaskFlow.Infrastructure;

namespace TaskFlow.Tests.Api;

[Collection(AuditLogsApiCollection.Name)]
public sealed class GetProjectAuditEndpointTests(TaskFlowApiFactory factory) : IAsyncLifetime
{
    private readonly HttpClient _client = factory.CreateClient();

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    /// <summary>Empties the shared in-memory database so tests can't observe each other's rows.</summary>
    public async ValueTask InitializeAsync()
    {
        using var scope = factory.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<TaskFlowDbContext>();
        await context.AuditLogs.ExecuteDeleteAsync(Ct);
        await context.Comments.ExecuteDeleteAsync(Ct);
        await context.Tasks.ExecuteDeleteAsync(Ct);
        await context.Projects.ExecuteDeleteAsync(Ct);
    }

    public ValueTask DisposeAsync() => ValueTask.CompletedTask;

    private async Task<Guid> SeedProjectAsync(string name = "Apollo")
    {
        var response = await _client.PostAsJsonAsync("/api/projects", new { name }, Ct);
        var project = await response.Content.ReadFromJsonAsync<ProjectResponseModel>(Ct);
        return project!.Id;
    }

    private async Task<Guid> SeedTaskAsync(Guid projectId, string title = "Write brief")
    {
        var response = await _client.PostAsJsonAsync($"/api/projects/{projectId}/tasks", new { title }, Ct);
        var task = await response.Content.ReadFromJsonAsync<TaskResponseModel>(Ct);
        return task!.Id;
    }

    private async Task AddCommentAsync(Guid taskId, string authorName, string text) =>
        (await _client.PostAsJsonAsync($"/api/tasks/{taskId}/comments", new { authorName, text }, Ct))
            .EnsureSuccessStatusCode();

    private static string AuditUrl(Guid projectId) => $"/api/projects/{projectId}/audit";

    private async Task<AuditLogResponseModel[]> GetAuditAsync(Guid projectId)
    {
        var response = await _client.GetAsync(AuditUrl(projectId), Ct);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var auditLogs = await response.Content.ReadFromJsonAsync<AuditLogResponseModel[]>(Ct);
        Assert.NotNull(auditLogs);

        return auditLogs;
    }

    [Fact]
    public async Task Get_WithExistingProject_ReturnsProjectCreatedEvent()
    {
        var projectId = await SeedProjectAsync();

        var auditLogs = await GetAuditAsync(projectId);

        var entry = Assert.Single(auditLogs);
        Assert.Equal("ProjectCreated", entry.EventType);
        Assert.Equal(projectId, entry.ProjectId);
        Assert.Null(entry.TaskId);
    }

    [Fact]
    public async Task Get_WithTasks_ReturnsProjectCreatedThenTaskCreatedEventsOldestFirst()
    {
        var projectId = await SeedProjectAsync();
        await SeedTaskAsync(projectId, "First task");
        await SeedTaskAsync(projectId, "Second task");

        var auditLogs = await GetAuditAsync(projectId);

        Assert.Equal(3, auditLogs.Length);
        Assert.Equal(["ProjectCreated", "TaskCreated", "TaskCreated"], auditLogs.Select(log => log.EventType));
    }

    /// <summary>
    /// Pins the documented trade-off: TaskCommentAdded rows carry no ProjectId (see
    /// CreateCommentHandler), so a project's audit trail surfaces its own creation and its tasks'
    /// creation, but not comments added to those tasks.
    /// </summary>
    [Fact]
    public async Task Get_DoesNotIncludeTaskCommentAddedEvents()
    {
        var projectId = await SeedProjectAsync();
        var taskId = await SeedTaskAsync(projectId);
        await AddCommentAsync(taskId, "Ada", "Looks good to me.");

        var auditLogs = await GetAuditAsync(projectId);

        Assert.DoesNotContain(auditLogs, log => log.EventType == "TaskCommentAdded");
        Assert.Equal(["ProjectCreated", "TaskCreated"], auditLogs.Select(log => log.EventType));
    }

    [Fact]
    public async Task Get_WithUnknownProjectId_Returns404()
    {
        var response = await _client.GetAsync(AuditUrl(Guid.CreateVersion7()), Ct);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Get_DoesNotReturnAuditLogsFromOtherProjects()
    {
        var projectA = await SeedProjectAsync("Project A");
        var projectB = await SeedProjectAsync("Project B");
        await SeedTaskAsync(projectA, "Task on A");

        var auditLogsForA = await GetAuditAsync(projectA);
        var auditLogsForB = await GetAuditAsync(projectB);

        Assert.Equal(2, auditLogsForA.Length);
        Assert.All(auditLogsForA, log => Assert.Equal(projectA, log.ProjectId));

        var entryForB = Assert.Single(auditLogsForB);
        Assert.Equal(projectB, entryForB.ProjectId);
    }

    private sealed record ProjectResponseModel(Guid Id, string Name, string? Description, DateTime CreatedAtUtc);

    private sealed record TaskResponseModel(
        Guid Id,
        Guid ProjectId,
        string Title,
        string? Description,
        string Status,
        DateTime? DueDate,
        DateTime CreatedAtUtc);

    private sealed record AuditLogResponseModel(
        Guid Id,
        Guid? ProjectId,
        Guid? TaskId,
        string EventType,
        string Description,
        DateTime CreatedAtUtc);
}
