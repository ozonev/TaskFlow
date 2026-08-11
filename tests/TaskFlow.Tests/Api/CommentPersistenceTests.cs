using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using TaskFlow.Domain.Projects;
using TaskFlow.Domain.TaskComments;
using TaskFlow.Domain.TaskItems;
using TaskFlow.Infrastructure;

namespace TaskFlow.Tests.Api;

/// <summary>
/// Asserts database guarantees rather than HTTP behavior: the comment-to-task relationship is
/// enforced only by the foreign key, because the entities deliberately carry no navigation
/// properties for EF to cascade through in memory.
/// </summary>
[Collection(CommentsApiCollection.Name)]
public sealed class CommentPersistenceTests(TaskFlowApiFactory factory) : IAsyncLifetime
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    /// <summary>Empties the shared in-memory database so tests can't observe each other's rows.</summary>
    public async ValueTask InitializeAsync()
    {
        using var scope = factory.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<TaskFlowDbContext>();
        await context.Comments.ExecuteDeleteAsync(Ct);
        await context.Tasks.ExecuteDeleteAsync(Ct);
        await context.Projects.ExecuteDeleteAsync(Ct);
    }

    public ValueTask DisposeAsync() => ValueTask.CompletedTask;

    private async Task<(Guid ProjectId, Guid TaskId)> SeedTaskAsync()
    {
        using var scope = factory.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<TaskFlowDbContext>();

        var project = Project.Create("Apollo", null);
        context.Projects.Add(project);

        var task = TaskItem.Create(project.Id, "Write brief", null, null);
        context.Tasks.Add(task);

        await context.SaveChangesAsync(Ct);

        return (project.Id, task.Id);
    }

    private async Task SeedCommentAsync(Guid taskId, string text)
    {
        using var scope = factory.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<TaskFlowDbContext>();

        context.Comments.Add(TaskComment.Create(taskId, "Ada", text));
        await context.SaveChangesAsync(Ct);
    }

    /// <summary>Proves the FK exists in the applied migration, not merely in the EF model.</summary>
    [Fact]
    public async Task Insert_WithUnknownTaskId_ThrowsDbUpdateException()
    {
        using var scope = factory.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<TaskFlowDbContext>();

        context.Comments.Add(TaskComment.Create(Guid.CreateVersion7(), "Ada", "Orphan"));

        await Assert.ThrowsAsync<DbUpdateException>(() => context.SaveChangesAsync(Ct));
    }

    /// <summary>
    /// ExecuteDeleteAsync bypasses the change tracker, so this exercises the database's own
    /// cascade rather than EF's in-memory fixup.
    /// </summary>
    [Fact]
    public async Task DeletingTask_CascadeDeletesItsCommentsOnly()
    {
        var (_, taskA) = await SeedTaskAsync();
        var (_, taskB) = await SeedTaskAsync();

        await SeedCommentAsync(taskA, "A1");
        await SeedCommentAsync(taskA, "A2");
        await SeedCommentAsync(taskB, "B1");

        using var scope = factory.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<TaskFlowDbContext>();

        await context.Tasks.Where(task => task.Id == taskA).ExecuteDeleteAsync(Ct);

        var remaining = await context.Comments.AsNoTracking().ToListAsync(Ct);

        var survivor = Assert.Single(remaining);
        Assert.Equal(taskB, survivor.TaskId);
        Assert.Equal("B1", survivor.Text);
    }

    [Fact]
    public async Task DeletingProject_CascadeDeletesTasksAndComments()
    {
        var (projectId, taskId) = await SeedTaskAsync();
        await SeedCommentAsync(taskId, "Doomed");

        using var scope = factory.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<TaskFlowDbContext>();

        await context.Projects.Where(project => project.Id == projectId).ExecuteDeleteAsync(Ct);

        Assert.Equal(0, await context.Tasks.CountAsync(Ct));
        Assert.Equal(0, await context.Comments.CountAsync(Ct));
    }
}
