using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using TaskFlow.Domain.Labels;
using TaskFlow.Domain.Projects;
using TaskFlow.Domain.TaskItems;
using TaskFlow.Infrastructure;

namespace TaskFlow.Tests.Api;

[Collection(TasksApiCollection.Name)]
public sealed class AssignTaskLabelEndpointTests(TaskFlowApiFactory factory) : IAsyncLifetime
{
    private readonly HttpClient _client = factory.CreateClient();

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    /// <summary>Empties the shared in-memory database so tests can't observe each other's rows.</summary>
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

    private async Task<Guid> SeedProjectAsync(string name = "Apollo")
    {
        using var scope = factory.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<TaskFlowDbContext>();
        var project = Project.Create(name, null);
        context.Projects.Add(project);
        await context.SaveChangesAsync(Ct);
        return project.Id;
    }

    private async Task<Guid> SeedTaskAsync(Guid projectId, string title = "Write brief")
    {
        using var scope = factory.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<TaskFlowDbContext>();
        var task = TaskItem.Create(projectId, title, null, null);
        context.Tasks.Add(task);
        await context.SaveChangesAsync(Ct);
        return task.Id;
    }

    private async Task<Guid> SeedLabelAsync(Guid projectId, string name = "Urgent")
    {
        using var scope = factory.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<TaskFlowDbContext>();
        var label = Label.Create(projectId, name);
        context.Labels.Add(label);
        await context.SaveChangesAsync(Ct);
        return label.Id;
    }

    private static string LabelsUrl(Guid taskId) => $"/api/tasks/{taskId}/labels";

    [Fact]
    public async Task Post_WithoutLabelId_Returns400()
    {
        var projectId = await SeedProjectAsync();
        var taskId = await SeedTaskAsync(projectId);

        var response = await _client.PostAsJsonAsync(LabelsUrl(taskId), new { }, Ct);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var problem = await response.Content.ReadFromJsonAsync<HttpValidationProblemDetails>(Ct);
        Assert.NotNull(problem);
        Assert.Contains(problem.Errors.Keys, key => key.Equals("labelId", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public async Task Post_WithValidRequest_Returns200WithLabelOnTask()
    {
        var projectId = await SeedProjectAsync();
        var taskId = await SeedTaskAsync(projectId);
        var labelId = await SeedLabelAsync(projectId);

        var response = await _client.PostAsJsonAsync(LabelsUrl(taskId), new { labelId }, Ct);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var task = await response.Content.ReadFromJsonAsync<TaskResponseModel>(Ct);
        Assert.NotNull(task);
        var label = Assert.Single(task.Labels);
        Assert.Equal(labelId, label.Id);
    }

    [Fact]
    public async Task Post_WithValidRequest_PersistsAssignment()
    {
        var projectId = await SeedProjectAsync();
        var taskId = await SeedTaskAsync(projectId);
        var labelId = await SeedLabelAsync(projectId);

        var response = await _client.PostAsJsonAsync(LabelsUrl(taskId), new { labelId }, Ct);
        response.EnsureSuccessStatusCode();

        using var scope = factory.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<TaskFlowDbContext>();
        var exists = await context.TaskLabels.AsNoTracking()
            .AnyAsync(tl => tl.TaskId == taskId && tl.LabelId == labelId, Ct);
        Assert.True(exists);
    }

    [Fact]
    public async Task Post_SameLabelTwice_IsIdempotent()
    {
        var projectId = await SeedProjectAsync();
        var taskId = await SeedTaskAsync(projectId);
        var labelId = await SeedLabelAsync(projectId);

        await _client.PostAsJsonAsync(LabelsUrl(taskId), new { labelId }, Ct);
        var response = await _client.PostAsJsonAsync(LabelsUrl(taskId), new { labelId }, Ct);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var task = await response.Content.ReadFromJsonAsync<TaskResponseModel>(Ct);
        Assert.NotNull(task);
        Assert.Single(task.Labels);
    }

    [Fact]
    public async Task Post_WithUnknownTaskId_Returns404()
    {
        var projectId = await SeedProjectAsync();
        var labelId = await SeedLabelAsync(projectId);

        var response = await _client.PostAsJsonAsync(LabelsUrl(Guid.CreateVersion7()), new { labelId }, Ct);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Post_WithUnknownLabelId_Returns404()
    {
        var projectId = await SeedProjectAsync();
        var taskId = await SeedTaskAsync(projectId);

        var response = await _client.PostAsJsonAsync(LabelsUrl(taskId), new { labelId = Guid.CreateVersion7() }, Ct);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Post_WithLabelFromDifferentProject_Returns400()
    {
        var projectA = await SeedProjectAsync("Apollo");
        var projectB = await SeedProjectAsync("Gemini");
        var taskId = await SeedTaskAsync(projectA);
        var labelId = await SeedLabelAsync(projectB);

        var response = await _client.PostAsJsonAsync(LabelsUrl(taskId), new { labelId }, Ct);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var problem = await response.Content.ReadFromJsonAsync<HttpValidationProblemDetails>(Ct);
        Assert.NotNull(problem);
        Assert.Contains(problem.Errors.Keys, key => key.Equals("labelId", StringComparison.OrdinalIgnoreCase));
    }

    private sealed record TaskResponseModel(
        Guid Id,
        Guid ProjectId,
        string Title,
        string? Description,
        string Status,
        DateTime? DueDate,
        DateTime CreatedAtUtc,
        LabelResponseModel[] Labels);

    private sealed record LabelResponseModel(Guid Id, Guid ProjectId, string Name, DateTime CreatedAtUtc);
}
