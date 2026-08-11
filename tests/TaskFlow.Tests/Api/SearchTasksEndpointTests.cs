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
public sealed class SearchTasksEndpointTests(TaskFlowApiFactory factory) : IAsyncLifetime
{
    private const string Url = "/api/tasks/search";

    private static readonly DateTime BaseTimestamp = new(2026, 1, 1, 12, 0, 0, DateTimeKind.Utc);

    private readonly HttpClient _client = factory.CreateClient();

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    /// <summary>Empties the shared in-memory database so tests can't observe each other's rows.</summary>
    public async ValueTask InitializeAsync()
    {
        using var scope = factory.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<TaskFlowDbContext>();
        await context.AuditLogs.ExecuteDeleteAsync(Ct);
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
    private async Task<TaskItem> SeedTaskAsync(
        Guid projectId,
        string title,
        DateTime? dueDate = null,
        DateTime? createdAtUtc = null)
    {
        using var scope = factory.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<TaskFlowDbContext>();

        var task = TaskItem.Create(projectId, title, null, dueDate);
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

        return task;
    }

    private async Task<TaskSearchResponseModel> SearchAsync(string query = "")
    {
        var response = await _client.GetAsync(Url + query, Ct);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var body = await response.Content.ReadFromJsonAsync<TaskSearchResponseModel>(Ct);
        Assert.NotNull(body);

        return body;
    }

    [Fact]
    public async Task Search_WithNoTasks_Returns200WithEmptyItemsAndZeroTotals()
    {
        var result = await SearchAsync();

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
    public async Task Search_WithDefaultPaging_ReturnsTasksOrderedByCreatedAtThenId()
    {
        var projectId = await SeedProjectAsync();
        await SeedTaskAsync(projectId, "Third", createdAtUtc: BaseTimestamp.AddMinutes(2));
        await SeedTaskAsync(projectId, "First", createdAtUtc: BaseTimestamp);
        await SeedTaskAsync(projectId, "Second", createdAtUtc: BaseTimestamp.AddMinutes(1));

        var result = await SearchAsync();

        Assert.Equal(["First", "Second", "Third"], result.Items.Select(item => item.Title));
    }

    [Fact]
    public async Task Search_FiltersByProjectId()
    {
        var projectA = await SeedProjectAsync();
        var projectB = await SeedProjectAsync();
        await SeedTaskAsync(projectA, "On A");
        await SeedTaskAsync(projectB, "On B");

        var result = await SearchAsync($"?projectId={projectA}");

        var task = Assert.Single(result.Items);
        Assert.Equal("On A", task.Title);
    }

    [Fact]
    public async Task Search_FiltersByStatus()
    {
        var projectId = await SeedProjectAsync();
        await SeedTaskAsync(projectId, "Todo task");

        var result = await SearchAsync("?status=Todo");

        Assert.Single(result.Items);
    }

    [Fact]
    public async Task Search_FiltersByDueDateRange()
    {
        var projectId = await SeedProjectAsync();
        await SeedTaskAsync(projectId, "In range", new DateTime(2026, 6, 15, 0, 0, 0, DateTimeKind.Utc));
        await SeedTaskAsync(projectId, "Out of range", new DateTime(2026, 8, 1, 0, 0, 0, DateTimeKind.Utc));
        await SeedTaskAsync(projectId, "No due date", null);

        var result = await SearchAsync("?dueDateFrom=2026-06-01T00:00:00Z&dueDateTo=2026-06-30T00:00:00Z");

        var task = Assert.Single(result.Items);
        Assert.Equal("In range", task.Title);
    }

    [Theory]
    [InlineData("brief")]
    [InlineData("BRIEF")]
    public async Task Search_FiltersByTitle_CaseInsensitiveSubstring(string titleFilter)
    {
        var projectId = await SeedProjectAsync();
        await SeedTaskAsync(projectId, "Write brief");
        await SeedTaskAsync(projectId, "Unrelated");

        var result = await SearchAsync($"?title={titleFilter}");

        var task = Assert.Single(result.Items);
        Assert.Equal("Write brief", task.Title);
    }

    [Fact]
    public async Task Search_CombinesMultipleFilters()
    {
        var projectA = await SeedProjectAsync();
        var projectB = await SeedProjectAsync();
        await SeedTaskAsync(projectA, "Write brief");
        await SeedTaskAsync(projectB, "Write brief");

        var result = await SearchAsync($"?projectId={projectA}&title=brief");

        var task = Assert.Single(result.Items);
        Assert.Equal(projectA, task.ProjectId);
    }

    [Fact]
    public async Task Search_WithReversedDueDateRange_Returns200WithEmptyItems()
    {
        var projectId = await SeedProjectAsync();
        await SeedTaskAsync(projectId, "Anything", new DateTime(2026, 6, 15, 0, 0, 0, DateTimeKind.Utc));

        var result = await SearchAsync("?dueDateFrom=2026-06-30T00:00:00Z&dueDateTo=2026-06-01T00:00:00Z");

        Assert.Empty(result.Items);
    }

    [Fact]
    public async Task Search_WithPageAndPageSize_ReturnsRequestedSliceAndCorrectEnvelope()
    {
        var projectId = await SeedProjectAsync();
        for (var i = 0; i < 5; i++)
        {
            await SeedTaskAsync(projectId, $"Task {i}", createdAtUtc: BaseTimestamp.AddMinutes(i));
        }

        var result = await SearchAsync("?page=2&pageSize=2");

        Assert.Equal(["Task 2", "Task 3"], result.Items.Select(item => item.Title));
        Assert.Equal(2, result.Page);
        Assert.Equal(2, result.PageSize);
        Assert.Equal(5, result.TotalCount);
        Assert.Equal(3, result.TotalPages);
    }

    [Fact]
    public async Task Search_WithPageBeyondRange_Returns200WithEmptyItemsButCorrectTotals()
    {
        var projectId = await SeedProjectAsync();
        await SeedTaskAsync(projectId, "Apollo");
        await SeedTaskAsync(projectId, "Zephyr");

        var result = await SearchAsync("?page=5&pageSize=20");

        Assert.Empty(result.Items);
        Assert.Equal(2, result.TotalCount);
        Assert.Equal(1, result.TotalPages);
    }

    [Fact]
    public async Task Search_ReturnsTaskCreatedByPost()
    {
        var projectId = await SeedProjectAsync();

        var response = await _client.PostAsJsonAsync(
            $"/api/projects/{projectId}/tasks",
            new { title = "Posted then searched" },
            Ct);
        response.EnsureSuccessStatusCode();
        var posted = await response.Content.ReadFromJsonAsync<TaskResponseModel>(Ct);
        Assert.NotNull(posted);

        var result = await SearchAsync();

        var fetched = Assert.Single(result.Items);
        Assert.Equal(posted, fetched);
    }

    [Fact]
    public async Task Search_WithTitleOverMaxLength_Returns400()
    {
        var response = await _client.GetAsync(Url + $"?title={new string('a', TaskItem.TitleMaxLength + 1)}", Ct);

        await AssertValidationProblemAsync(response, "title");
    }

    [Fact]
    public async Task Search_WithTitleAtMaxLength_Returns200()
    {
        var result = await SearchAsync($"?title={new string('a', TaskItem.TitleMaxLength)}");

        Assert.Empty(result.Items);
    }

    [Fact]
    public async Task Search_WithPageLessThanOne_Returns400()
    {
        var response = await _client.GetAsync(Url + "?page=0", Ct);

        await AssertValidationProblemAsync(response, "page");
    }

    [Fact]
    public async Task Search_WithPageSizeAboveCap_Returns400()
    {
        var response = await _client.GetAsync(Url + "?pageSize=101", Ct);

        await AssertValidationProblemAsync(response, "pageSize");
    }

    [Fact]
    public async Task Search_WithNonIntegerPage_Returns400()
    {
        var response = await _client.GetAsync(Url + "?page=abc", Ct);

        await AssertValidationProblemAsync(response, "page");
    }

    private static async Task AssertValidationProblemAsync(HttpResponseMessage response, string expectedMember)
    {
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);

        var problem = await response.Content.ReadFromJsonAsync<HttpValidationProblemDetails>(Ct);
        Assert.NotNull(problem);
        Assert.Contains(problem.Errors.Keys, key => key.Equals(expectedMember, StringComparison.OrdinalIgnoreCase));
    }

    private sealed record TaskSearchResponseModel(
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
