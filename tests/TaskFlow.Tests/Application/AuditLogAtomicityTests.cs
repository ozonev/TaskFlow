using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using TaskFlow.Application.Abstractions;
using TaskFlow.Application.Comments;
using TaskFlow.Application.Projects;
using TaskFlow.Application.Tasks;
using TaskFlow.Domain.AuditLogs;
using TaskFlow.Domain.Projects;
using TaskFlow.Domain.TaskItems;
using TaskFlow.Infrastructure;
using TaskFlow.Tests.Api;

namespace TaskFlow.Tests.Application;

/// <summary>
/// Proves the entity write and its audit-log write commit as a single transaction: if the audit
/// write fails, the entity must not be left persisted either. Constructs handlers directly with a
/// throwing IAuditLogRepository rather than going through DI, since no test elsewhere in this repo
/// needs to override a single dependency mid-request.
/// </summary>
[Collection(CommentsApiCollection.Name)]
public sealed class AuditLogAtomicityTests(TaskFlowApiFactory factory) : IAsyncLifetime
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

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

    private sealed class ThrowingAuditLogRepository : IAuditLogRepository
    {
        public Task AddAsync(AuditLog auditLog, CancellationToken cancellationToken) =>
            throw new InvalidOperationException("Simulated audit-log failure.");

        public Task<IReadOnlyList<AuditLog>> ListByTaskIdAsync(Guid taskId, CancellationToken cancellationToken) =>
            throw new NotSupportedException();

        public Task<IReadOnlyList<AuditLog>> ListByProjectIdAsync(Guid projectId, CancellationToken cancellationToken) =>
            throw new NotSupportedException();
    }

    private async Task<Guid> SeedProjectAsync()
    {
        using var scope = factory.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<TaskFlowDbContext>();
        var project = Project.Create("Apollo", null);
        context.Projects.Add(project);
        await context.SaveChangesAsync(Ct);
        return project.Id;
    }

    private async Task<Guid> SeedTaskAsync(Guid projectId)
    {
        using var scope = factory.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<TaskFlowDbContext>();
        var task = TaskItem.Create(projectId, "Write brief", null, null);
        context.Tasks.Add(task);
        await context.SaveChangesAsync(Ct);
        return task.Id;
    }

    [Fact]
    public async Task CreateProject_WhenAuditLogWriteFails_RollsBackTheProjectToo()
    {
        using var scope = factory.CreateScope();
        var handler = new CreateProjectHandler(
            scope.ServiceProvider.GetRequiredService<IProjectRepository>(),
            new ThrowingAuditLogRepository(),
            scope.ServiceProvider.GetRequiredService<IUnitOfWork>());

        await Assert.ThrowsAsync<InvalidOperationException>(
            () => handler.HandleAsync(new CreateProjectCommand("Apollo", null), Ct));

        var context = scope.ServiceProvider.GetRequiredService<TaskFlowDbContext>();
        Assert.Equal(0, await context.Projects.CountAsync(Ct));
    }

    [Fact]
    public async Task CreateTask_WhenAuditLogWriteFails_RollsBackTheTaskToo()
    {
        var projectId = await SeedProjectAsync();

        using var scope = factory.CreateScope();
        var handler = new CreateTaskHandler(
            scope.ServiceProvider.GetRequiredService<ITaskRepository>(),
            scope.ServiceProvider.GetRequiredService<IProjectRepository>(),
            new ThrowingAuditLogRepository(),
            scope.ServiceProvider.GetRequiredService<IUnitOfWork>());

        await Assert.ThrowsAsync<InvalidOperationException>(
            () => handler.HandleAsync(new CreateTaskCommand(projectId, "Write brief", null, null), Ct));

        var context = scope.ServiceProvider.GetRequiredService<TaskFlowDbContext>();
        Assert.Equal(0, await context.Tasks.CountAsync(Ct));
    }

    [Fact]
    public async Task CreateComment_WhenAuditLogWriteFails_RollsBackTheCommentToo()
    {
        var projectId = await SeedProjectAsync();
        var taskId = await SeedTaskAsync(projectId);

        using var scope = factory.CreateScope();
        var handler = new CreateCommentHandler(
            scope.ServiceProvider.GetRequiredService<ICommentRepository>(),
            scope.ServiceProvider.GetRequiredService<ITaskRepository>(),
            new ThrowingAuditLogRepository(),
            scope.ServiceProvider.GetRequiredService<IUnitOfWork>());

        await Assert.ThrowsAsync<InvalidOperationException>(
            () => handler.HandleAsync(new CreateCommentCommand(taskId, "Ada", "Looks good."), Ct));

        var context = scope.ServiceProvider.GetRequiredService<TaskFlowDbContext>();
        Assert.Equal(0, await context.Comments.CountAsync(Ct));
    }
}
