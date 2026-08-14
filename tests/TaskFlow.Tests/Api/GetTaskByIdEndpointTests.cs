using System.Net;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using TaskFlow.Domain.Projects;
using TaskFlow.Domain.TaskItems;
using TaskFlow.Infrastructure;

namespace TaskFlow.Tests.Api;

[Collection(TasksApiCollection.Name)]
public sealed class GetTaskByIdEndpointTests(TaskFlowApiFactory factory) : IAsyncLifetime
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

    private async Task<TaskItem> SeedTaskAsync()
    {
        using var scope = factory.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<TaskFlowDbContext>();

        var project = Project.Create("Apollo", null);
        context.Projects.Add(project);

        var task = TaskItem.Create(project.Id, "Write brief", "First slice", null);
        context.Tasks.Add(task);

        await context.SaveChangesAsync(Ct);
        return task;
    }

    [Fact]
    public async Task Get_WithExistingId_Returns200WithTask()
    {
        var task = await SeedTaskAsync();

        var response = await _client.GetAsync($"/api/tasks/{task.Id}", Ct);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var body = await response.Content.ReadFromJsonAsync<TaskResponseModel>(Ct);
        Assert.NotNull(body);
        Assert.Equal(task.Id, body.Id);
        Assert.Equal(task.ProjectId, body.ProjectId);
        Assert.Equal(task.Title, body.Title);
        Assert.Equal(task.Description, body.Description);
        Assert.Equal("Todo", body.Status);
    }

    [Fact]
    public async Task Get_WithUnknownId_Returns404()
    {
        var response = await _client.GetAsync($"/api/tasks/{Guid.CreateVersion7()}", Ct);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
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
