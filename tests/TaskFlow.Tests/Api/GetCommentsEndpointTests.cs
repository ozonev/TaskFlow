using System.Net;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using TaskFlow.Domain.Projects;
using TaskFlow.Domain.TaskComments;
using TaskFlow.Domain.TaskItems;
using TaskFlow.Infrastructure;

namespace TaskFlow.Tests.Api;

[Collection(CommentsApiCollection.Name)]
public sealed class GetCommentsEndpointTests(TaskFlowApiFactory factory) : IAsyncLifetime
{
    private readonly HttpClient _client = factory.CreateClient();

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

    private async Task<Guid> SeedTaskAsync()
    {
        using var scope = factory.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<TaskFlowDbContext>();

        var project = Project.Create("Apollo", null);
        context.Projects.Add(project);

        var task = TaskItem.Create(project.Id, "Write brief", null, null);
        context.Tasks.Add(task);

        await context.SaveChangesAsync(Ct);

        return task.Id;
    }

    /// <summary>
    /// Ordering assertions pass an explicit <paramref name="createdAtUtc"/> rather than relying on
    /// consecutive DateTime.UtcNow reads differing — on a host with a coarse (~15.6 ms) system timer
    /// those would tie, and the Id tie-break is stable but not chronological.
    /// </summary>
    private async Task<TaskComment> SeedCommentAsync(
        Guid taskId,
        string authorName,
        string text,
        DateTime? createdAtUtc = null)
    {
        using var scope = factory.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<TaskFlowDbContext>();

        var comment = TaskComment.Create(taskId, authorName, text);
        context.Comments.Add(comment);
        await context.SaveChangesAsync(Ct);

        if (createdAtUtc is not null)
        {
            await context.Comments
                .Where(seeded => seeded.Id == comment.Id)
                .ExecuteUpdateAsync(
                    setters => setters.SetProperty(seeded => seeded.CreatedAtUtc, createdAtUtc.Value),
                    Ct);
        }

        return comment;
    }

    private static readonly DateTime BaseTimestamp = new(2026, 1, 1, 12, 0, 0, DateTimeKind.Utc);

    private static string CommentsUrl(Guid taskId) => $"/api/tasks/{taskId}/comments";

    private async Task<CommentResponseModel[]> GetCommentsAsync(Guid taskId)
    {
        var response = await _client.GetAsync(CommentsUrl(taskId), Ct);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var comments = await response.Content.ReadFromJsonAsync<CommentResponseModel[]>(Ct);
        Assert.NotNull(comments);

        return comments;
    }

    [Fact]
    public async Task Get_WithExistingTaskAndNoComments_Returns200WithEmptyArray()
    {
        var taskId = await SeedTaskAsync();

        var comments = await GetCommentsAsync(taskId);

        Assert.Empty(comments);
    }

    [Fact]
    public async Task Get_WithComments_Returns200WithAllComments()
    {
        var taskId = await SeedTaskAsync();
        var first = await SeedCommentAsync(taskId, "Ada", "First", BaseTimestamp);
        var second = await SeedCommentAsync(taskId, "Grace", "Second", BaseTimestamp.AddMinutes(1));

        var comments = await GetCommentsAsync(taskId);

        Assert.Equal(2, comments.Length);
        Assert.Equal([first.Id, second.Id], comments.Select(comment => comment.Id));
        Assert.Equal([taskId, taskId], comments.Select(comment => comment.TaskId));
        Assert.Equal(["Ada", "Grace"], comments.Select(comment => comment.AuthorName));
        Assert.Equal(["First", "Second"], comments.Select(comment => comment.Text));
    }

    /// <summary>
    /// Seeded so insertion order deliberately contradicts chronological order, which proves the
    /// result is sorted by CreatedAtUtc rather than by insertion or rowid.
    /// </summary>
    [Fact]
    public async Task Get_ReturnsCommentsOldestFirst()
    {
        var taskId = await SeedTaskAsync();
        await SeedCommentAsync(taskId, "Ada", "third", BaseTimestamp.AddMinutes(2));
        await SeedCommentAsync(taskId, "Grace", "first", BaseTimestamp);
        await SeedCommentAsync(taskId, "Alan", "second", BaseTimestamp.AddMinutes(1));

        var comments = await GetCommentsAsync(taskId);

        Assert.Equal(["first", "second", "third"], comments.Select(comment => comment.Text));
    }

    [Fact]
    public async Task Get_ReturnsTheCommentCreatedByPost()
    {
        var taskId = await SeedTaskAsync();

        var response = await _client.PostAsJsonAsync(
            CommentsUrl(taskId),
            new { authorName = "Ada", text = "Posted then fetched" },
            Ct);
        response.EnsureSuccessStatusCode();

        var posted = await response.Content.ReadFromJsonAsync<CommentResponseModel>(Ct);
        Assert.NotNull(posted);

        var comments = await GetCommentsAsync(taskId);

        var fetched = Assert.Single(comments);
        Assert.Equal(posted, fetched);
    }

    /// <summary>
    /// Pins the ThenBy(Id) tie-break that ICommentRepository.GetByTaskIdAsync promises: with equal
    /// timestamps the order is Id-ascending and identical across calls, rather than whatever the
    /// provider happens to return.
    /// </summary>
    [Fact]
    public async Task Get_WithTiedTimestamps_OrdersByIdRepeatably()
    {
        var taskId = await SeedTaskAsync();
        await SeedCommentAsync(taskId, "Ada", "A");
        await SeedCommentAsync(taskId, "Grace", "B");
        await SeedCommentAsync(taskId, "Alan", "C");

        var tiedTimestamp = new DateTime(2026, 1, 1, 12, 0, 0, DateTimeKind.Utc);

        using (var scope = factory.CreateScope())
        {
            var context = scope.ServiceProvider.GetRequiredService<TaskFlowDbContext>();
            await context.Comments
                .Where(comment => comment.TaskId == taskId)
                .ExecuteUpdateAsync(setters => setters.SetProperty(c => c.CreatedAtUtc, tiedTimestamp), Ct);
        }

        var first = await GetCommentsAsync(taskId);
        var second = await GetCommentsAsync(taskId);

        var expected = first.Select(comment => comment.Id).Order().ToArray();
        Assert.Equal(expected, first.Select(comment => comment.Id));
        Assert.Equal(expected, second.Select(comment => comment.Id));
    }

    [Fact]
    public async Task Get_WithUnknownTaskId_Returns404()
    {
        var response = await _client.GetAsync(CommentsUrl(Guid.CreateVersion7()), Ct);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Get_DoesNotReturnCommentsFromOtherTasks()
    {
        var taskA = await SeedTaskAsync();
        var taskB = await SeedTaskAsync();

        var firstOnA = await SeedCommentAsync(taskA, "Ada", "A1", BaseTimestamp);
        var secondOnA = await SeedCommentAsync(taskA, "Grace", "A2", BaseTimestamp.AddMinutes(1));
        var onlyOnB = await SeedCommentAsync(taskB, "Alan", "B1", BaseTimestamp);

        var commentsOnA = await GetCommentsAsync(taskA);
        var commentsOnB = await GetCommentsAsync(taskB);

        Assert.Equal([firstOnA.Id, secondOnA.Id], commentsOnA.Select(comment => comment.Id));
        Assert.Equal([onlyOnB.Id], commentsOnB.Select(comment => comment.Id));
    }

    /// <summary>
    /// The Kind assertion is the part that pins .HasUtcConversion(): without it SQLite reads the
    /// value back Unspecified, which serializes without the trailing Z and deserializes back to
    /// Unspecified. Ticks would still match, since DateTime equality ignores Kind.
    /// </summary>
    [Fact]
    public async Task Get_RoundTripsCreatedAtUtcFromDatabase()
    {
        var taskId = await SeedTaskAsync();
        var seeded = await SeedCommentAsync(taskId, "Ada", "Round trip");

        var comments = await GetCommentsAsync(taskId);

        var comment = Assert.Single(comments);
        Assert.Equal(seeded.CreatedAtUtc, comment.CreatedAtUtc);
        Assert.Equal(DateTimeKind.Utc, comment.CreatedAtUtc.Kind);
    }

    private sealed record CommentResponseModel(
        Guid Id,
        Guid TaskId,
        string AuthorName,
        string Text,
        DateTime CreatedAtUtc);
}
