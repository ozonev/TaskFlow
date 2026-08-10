using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using TaskFlow.Domain.AuditLogs;
using TaskFlow.Infrastructure;

namespace TaskFlow.Tests.Api;

/// <summary>
/// Verifies each creation handler writes its audit row by querying
/// <see cref="TaskFlowDbContext.AuditLogs"/> directly, independently of the audit read endpoints.
/// </summary>
[Collection(CommentsApiCollection.Name)]
public sealed class AuditLogWritingTests(TaskFlowApiFactory factory) : IAsyncLifetime
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

    private async Task<IReadOnlyList<AuditLog>> GetAuditLogsAsync()
    {
        using var scope = factory.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<TaskFlowDbContext>();
        return await context.AuditLogs.AsNoTracking().ToListAsync(Ct);
    }

    [Fact]
    public async Task CreateProject_WritesProjectCreatedAuditLog()
    {
        var response = await _client.PostAsJsonAsync("/api/projects", new { name = "Apollo" }, Ct);
        response.EnsureSuccessStatusCode();
        var project = await response.Content.ReadFromJsonAsync<ProjectResponseModel>(Ct);
        Assert.NotNull(project);

        var auditLog = Assert.Single(await GetAuditLogsAsync());

        Assert.Equal(AuditEventType.ProjectCreated, auditLog.EventType);
        Assert.Equal(project.Id, auditLog.ProjectId);
        Assert.Null(auditLog.TaskId);
        Assert.Contains("Apollo", auditLog.Description);
        Assert.Equal(DateTimeKind.Utc, auditLog.CreatedAtUtc.Kind);
    }

    [Fact]
    public async Task CreateTask_WritesTaskCreatedAuditLog()
    {
        var projectResponse = await _client.PostAsJsonAsync("/api/projects", new { name = "Apollo" }, Ct);
        var project = await projectResponse.Content.ReadFromJsonAsync<ProjectResponseModel>(Ct);
        Assert.NotNull(project);

        var taskResponse = await _client.PostAsJsonAsync(
            $"/api/projects/{project.Id}/tasks",
            new { title = "Write brief" },
            Ct);
        taskResponse.EnsureSuccessStatusCode();
        var task = await taskResponse.Content.ReadFromJsonAsync<TaskResponseModel>(Ct);
        Assert.NotNull(task);

        var auditLogs = await GetAuditLogsAsync();
        var taskCreated = Assert.Single(auditLogs, log => log.EventType == AuditEventType.TaskCreated);

        Assert.Equal(project.Id, taskCreated.ProjectId);
        Assert.Equal(task.Id, taskCreated.TaskId);
        Assert.Contains("Write brief", taskCreated.Description);
    }

    [Fact]
    public async Task CreateComment_WritesTaskCommentAddedAuditLogWithoutProjectId()
    {
        var projectResponse = await _client.PostAsJsonAsync("/api/projects", new { name = "Apollo" }, Ct);
        var project = await projectResponse.Content.ReadFromJsonAsync<ProjectResponseModel>(Ct);
        Assert.NotNull(project);

        var taskResponse = await _client.PostAsJsonAsync(
            $"/api/projects/{project.Id}/tasks",
            new { title = "Write brief" },
            Ct);
        var task = await taskResponse.Content.ReadFromJsonAsync<TaskResponseModel>(Ct);
        Assert.NotNull(task);

        var commentResponse = await _client.PostAsJsonAsync(
            $"/api/tasks/{task.Id}/comments",
            new { authorName = "Ada", text = "Looks good to me." },
            Ct);
        commentResponse.EnsureSuccessStatusCode();

        var auditLogs = await GetAuditLogsAsync();
        var commentAdded = Assert.Single(auditLogs, log => log.EventType == AuditEventType.TaskCommentAdded);

        Assert.Equal(task.Id, commentAdded.TaskId);
        Assert.Null(commentAdded.ProjectId);
        Assert.Contains("Ada", commentAdded.Description);
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
}
