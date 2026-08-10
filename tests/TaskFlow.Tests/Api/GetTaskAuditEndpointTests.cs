using System.Net;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using TaskFlow.Infrastructure;

namespace TaskFlow.Tests.Api;

[Collection(AuditLogsApiCollection.Name)]
public sealed class GetTaskAuditEndpointTests(TaskFlowApiFactory factory) : IAsyncLifetime
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

    private async Task<Guid> SeedProjectAsync()
    {
        var response = await _client.PostAsJsonAsync("/api/projects", new { name = "Apollo" }, Ct);
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

    private static string AuditUrl(Guid taskId) => $"/api/tasks/{taskId}/audit";

    private async Task<AuditLogResponseModel[]> GetAuditAsync(Guid taskId)
    {
        var response = await _client.GetAsync(AuditUrl(taskId), Ct);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var auditLogs = await response.Content.ReadFromJsonAsync<AuditLogResponseModel[]>(Ct);
        Assert.NotNull(auditLogs);

        return auditLogs;
    }

    [Fact]
    public async Task Get_WithExistingTask_ReturnsTaskCreatedEvent()
    {
        var projectId = await SeedProjectAsync();
        var taskId = await SeedTaskAsync(projectId);

        var auditLogs = await GetAuditAsync(taskId);

        var entry = Assert.Single(auditLogs);
        Assert.Equal("TaskCreated", entry.EventType);
        Assert.Equal(projectId, entry.ProjectId);
        Assert.Equal(taskId, entry.TaskId);
    }

    [Fact]
    public async Task Get_WithComments_ReturnsTaskCreatedThenCommentAddedEventsOldestFirst()
    {
        var projectId = await SeedProjectAsync();
        var taskId = await SeedTaskAsync(projectId);
        await AddCommentAsync(taskId, "Ada", "First");
        await AddCommentAsync(taskId, "Grace", "Second");

        var auditLogs = await GetAuditAsync(taskId);

        Assert.Equal(3, auditLogs.Length);
        Assert.Equal(["TaskCreated", "TaskCommentAdded", "TaskCommentAdded"], auditLogs.Select(log => log.EventType));
        Assert.All(auditLogs, log => Assert.Equal(taskId, log.TaskId));
    }

    [Fact]
    public async Task Get_WithUnknownTaskId_Returns404()
    {
        var response = await _client.GetAsync(AuditUrl(Guid.CreateVersion7()), Ct);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Get_DoesNotReturnAuditLogsFromOtherTasks()
    {
        var projectId = await SeedProjectAsync();
        var taskA = await SeedTaskAsync(projectId, "Task A");
        var taskB = await SeedTaskAsync(projectId, "Task B");
        await AddCommentAsync(taskA, "Ada", "On A");

        var auditLogsForA = await GetAuditAsync(taskA);
        var auditLogsForB = await GetAuditAsync(taskB);

        Assert.Equal(2, auditLogsForA.Length);
        Assert.All(auditLogsForA, log => Assert.Equal(taskA, log.TaskId));

        var entryForB = Assert.Single(auditLogsForB);
        Assert.Equal(taskB, entryForB.TaskId);
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
