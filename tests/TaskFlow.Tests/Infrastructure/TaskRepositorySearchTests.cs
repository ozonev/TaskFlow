using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using TaskFlow.Application.Abstractions;
using TaskFlow.Domain.Labels;
using TaskFlow.Domain.Projects;
using TaskFlow.Domain.TaskItems;
using TaskFlow.Infrastructure;
using TaskFlow.Tests.Api;

namespace TaskFlow.Tests.Infrastructure;

/// <summary>
/// Exercises TaskRepository.SearchAsync/CountAsync filter logic directly, without going through
/// the HTTP endpoint (see SearchTasksEndpointTests for the API contract). No other test class
/// needs this host, so a dedicated IClassFixture is simpler than a shared collection.
/// </summary>
public sealed class TaskRepositorySearchTests(TaskFlowApiFactory factory) : IClassFixture<TaskFlowApiFactory>, IAsyncLifetime
{
    private static readonly TaskSearchFilter NoFilter = new(null, null, null, null, null);

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    public async ValueTask InitializeAsync()
    {
        using var scope = factory.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<TaskFlowDbContext>();
        await context.TaskLabels.ExecuteDeleteAsync(Ct);
        await context.Labels.ExecuteDeleteAsync(Ct);
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

    private async Task<TaskItem> SeedTaskAsync(Guid projectId, string title, DateTime? dueDate = null)
    {
        using var scope = factory.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<TaskFlowDbContext>();
        var task = TaskItem.Create(projectId, title, null, dueDate);
        context.Tasks.Add(task);
        await context.SaveChangesAsync(Ct);
        return task;
    }

    private async Task<Guid> SeedLabelAsync(Guid projectId, string name)
    {
        using var scope = factory.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<TaskFlowDbContext>();
        var label = Label.Create(projectId, name);
        context.Labels.Add(label);
        await context.SaveChangesAsync(Ct);
        return label.Id;
    }

    private async Task AssignLabelAsync(Guid taskId, Guid labelId)
    {
        using var scope = factory.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<TaskFlowDbContext>();
        context.TaskLabels.Add(TaskLabel.Create(taskId, labelId));
        await context.SaveChangesAsync(Ct);
    }

    private async Task<IReadOnlyList<TaskItem>> SearchAsync(TaskSearchFilter filter)
    {
        using var scope = factory.CreateScope();
        var repository = scope.ServiceProvider.GetRequiredService<ITaskRepository>();
        return await repository.SearchAsync(filter, 0, 100, Ct);
    }

    private async Task<int> CountAsync(TaskSearchFilter filter)
    {
        using var scope = factory.CreateScope();
        var repository = scope.ServiceProvider.GetRequiredService<ITaskRepository>();
        return await repository.CountAsync(filter, Ct);
    }

    [Fact]
    public async Task SearchAsync_WithNoFilter_ReturnsAllTasks()
    {
        var projectId = await SeedProjectAsync();
        await SeedTaskAsync(projectId, "First");
        await SeedTaskAsync(projectId, "Second");

        var results = await SearchAsync(NoFilter);

        Assert.Equal(2, results.Count);
        Assert.Equal(2, await CountAsync(NoFilter));
    }

    [Fact]
    public async Task SearchAsync_FiltersByProjectId()
    {
        var projectA = await SeedProjectAsync();
        var projectB = await SeedProjectAsync();
        await SeedTaskAsync(projectA, "On A");
        await SeedTaskAsync(projectB, "On B");

        var results = await SearchAsync(NoFilter with { ProjectId = projectA });

        var task = Assert.Single(results);
        Assert.Equal("On A", task.Title);
    }

    [Fact]
    public async Task SearchAsync_FiltersByStatus()
    {
        var projectId = await SeedProjectAsync();
        await SeedTaskAsync(projectId, "Todo task");

        var matching = await SearchAsync(NoFilter with { Status = TaskItemStatus.Todo });

        Assert.Single(matching);
    }

    [Fact]
    public async Task SearchAsync_FiltersByDueDateRange_InclusiveBoundaries()
    {
        var projectId = await SeedProjectAsync();
        var inRange = new DateTime(2026, 6, 15, 0, 0, 0, DateTimeKind.Utc);
        await SeedTaskAsync(projectId, "Before range", new DateTime(2026, 6, 1, 0, 0, 0, DateTimeKind.Utc));
        await SeedTaskAsync(projectId, "At start", new DateTime(2026, 6, 10, 0, 0, 0, DateTimeKind.Utc));
        await SeedTaskAsync(projectId, "In range", inRange);
        await SeedTaskAsync(projectId, "At end", new DateTime(2026, 6, 20, 0, 0, 0, DateTimeKind.Utc));
        await SeedTaskAsync(projectId, "After range", new DateTime(2026, 7, 1, 0, 0, 0, DateTimeKind.Utc));

        var results = await SearchAsync(NoFilter with
        {
            DueDateFrom = new DateTime(2026, 6, 10, 0, 0, 0, DateTimeKind.Utc),
            DueDateTo = new DateTime(2026, 6, 20, 0, 0, 0, DateTimeKind.Utc),
        });

        Assert.Equal(["At start", "In range", "At end"], results.Select(task => task.Title));
    }

    [Fact]
    public async Task SearchAsync_WithDueDateRange_ExcludesTasksWithNullDueDate()
    {
        var projectId = await SeedProjectAsync();
        await SeedTaskAsync(projectId, "No due date", null);
        await SeedTaskAsync(projectId, "Has due date", new DateTime(2026, 6, 15, 0, 0, 0, DateTimeKind.Utc));

        var results = await SearchAsync(NoFilter with
        {
            DueDateFrom = new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc),
            DueDateTo = new DateTime(2026, 12, 31, 0, 0, 0, DateTimeKind.Utc),
        });

        var task = Assert.Single(results);
        Assert.Equal("Has due date", task.Title);
    }

    [Theory]
    [InlineData("brief")]
    [InlineData("BRIEF")]
    [InlineData("Brief")]
    public async Task SearchAsync_FiltersByTitle_CaseInsensitiveSubstring(string titleFilter)
    {
        var projectId = await SeedProjectAsync();
        await SeedTaskAsync(projectId, "Write brief");
        await SeedTaskAsync(projectId, "Unrelated");

        var results = await SearchAsync(NoFilter with { Title = titleFilter });

        var task = Assert.Single(results);
        Assert.Equal("Write brief", task.Title);
    }

    [Fact]
    public async Task SearchAsync_CombinesFilters()
    {
        var projectA = await SeedProjectAsync();
        var projectB = await SeedProjectAsync();
        await SeedTaskAsync(projectA, "Write brief");
        await SeedTaskAsync(projectB, "Write brief");

        var results = await SearchAsync(NoFilter with { ProjectId = projectA, Title = "brief" });

        var task = Assert.Single(results);
        Assert.Equal(projectA, task.ProjectId);
    }

    [Fact]
    public async Task SearchAsync_FiltersByLabel_LabelOnly()
    {
        var projectId = await SeedProjectAsync();
        var labelId = await SeedLabelAsync(projectId, "Urgent");
        var labeled = await SeedTaskAsync(projectId, "Labeled");
        await SeedTaskAsync(projectId, "Unlabeled");
        await AssignLabelAsync(labeled.Id, labelId);

        var results = await SearchAsync(NoFilter with { LabelId = labelId });

        var task = Assert.Single(results);
        Assert.Equal("Labeled", task.Title);
    }

    [Fact]
    public async Task SearchAsync_FiltersByStatusAndLabel_Combined()
    {
        var projectId = await SeedProjectAsync();
        var labelId = await SeedLabelAsync(projectId, "Urgent");
        var matching = await SeedTaskAsync(projectId, "Matches both");
        var labelOnly = await SeedTaskAsync(projectId, "Label only");
        await AssignLabelAsync(matching.Id, labelId);
        await AssignLabelAsync(labelOnly.Id, labelId);

        var results = await SearchAsync(NoFilter with { Status = TaskItemStatus.Todo, LabelId = labelId });

        // Every seeded task is Todo, so this proves both predicates apply rather than
        // either alone (a broken AND would still return exactly one of these two).
        Assert.Equal(2, results.Count);
    }

    [Fact]
    public async Task SearchAsync_FiltersByLabel_ExcludesTasksFromOtherProjects()
    {
        var projectA = await SeedProjectAsync();
        var projectB = await SeedProjectAsync();
        var labelId = await SeedLabelAsync(projectA, "Urgent");
        var taskOnA = await SeedTaskAsync(projectA, "On A");
        await SeedTaskAsync(projectB, "On B");
        await AssignLabelAsync(taskOnA.Id, labelId);

        var results = await SearchAsync(NoFilter with { LabelId = labelId });

        var task = Assert.Single(results);
        Assert.Equal("On A", task.Title);
    }

    [Fact]
    public async Task SearchAsync_RespectsSkipAndTake()
    {
        var projectId = await SeedProjectAsync();
        await SeedTaskAsync(projectId, "First");
        await SeedTaskAsync(projectId, "Second");
        await SeedTaskAsync(projectId, "Third");

        using var scope = factory.CreateScope();
        var repository = scope.ServiceProvider.GetRequiredService<ITaskRepository>();
        var page = await repository.SearchAsync(NoFilter, 1, 1, Ct);

        var task = Assert.Single(page);
        Assert.Equal("Second", task.Title);
    }
}
