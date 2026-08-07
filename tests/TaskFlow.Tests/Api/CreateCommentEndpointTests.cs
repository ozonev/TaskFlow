using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using TaskFlow.Domain.Projects;
using TaskFlow.Domain.TaskItems;
using TaskFlow.Infrastructure;

namespace TaskFlow.Tests.Api;

[Collection(CommentsApiCollection.Name)]
public sealed class CreateCommentEndpointTests(TaskFlowApiFactory factory) : IAsyncLifetime
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

    private static string CommentsUrl(Guid taskId) => $"/api/tasks/{taskId}/comments";

    [Fact]
    public async Task Post_WithValidRequest_Returns201WithCreatedComment()
    {
        var taskId = await SeedTaskAsync();
        var before = DateTime.UtcNow;

        var response = await _client.PostAsJsonAsync(
            CommentsUrl(taskId),
            new { authorName = "Ada Lovelace", text = "Looks good to me." },
            Ct);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);

        var comment = await response.Content.ReadFromJsonAsync<CommentResponseModel>(Ct);
        Assert.NotNull(comment);
        Assert.NotEqual(Guid.Empty, comment.Id);
        Assert.Equal(taskId, comment.TaskId);
        Assert.Equal("Ada Lovelace", comment.AuthorName);
        Assert.Equal("Looks good to me.", comment.Text);
        Assert.InRange(comment.CreatedAtUtc, before.AddSeconds(-1), DateTime.UtcNow.AddSeconds(1));

        Assert.Equal($"{CommentsUrl(taskId)}/{comment.Id}", response.Headers.Location?.OriginalString);
    }

    [Fact]
    public async Task Post_WithValidRequest_PersistsComment()
    {
        var taskId = await SeedTaskAsync();

        var response = await _client.PostAsJsonAsync(
            CommentsUrl(taskId),
            new { authorName = "  Ada  ", text = "  Trimmed  " },
            Ct);
        response.EnsureSuccessStatusCode();

        var created = await response.Content.ReadFromJsonAsync<CommentResponseModel>(Ct);
        Assert.NotNull(created);

        using var scope = factory.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<TaskFlowDbContext>();

        var persisted = await context.Comments.AsNoTracking()
            .SingleOrDefaultAsync(comment => comment.Id == created.Id, Ct);

        Assert.NotNull(persisted);
        Assert.Equal(taskId, persisted.TaskId);
        Assert.Equal("Ada", persisted.AuthorName);
        Assert.Equal("Trimmed", persisted.Text);
        Assert.Equal(DateTimeKind.Utc, persisted.CreatedAtUtc.Kind);
    }

    [Fact]
    public async Task Post_WithUnknownTaskId_Returns404()
    {
        var response = await _client.PostAsJsonAsync(
            CommentsUrl(Guid.CreateVersion7()),
            new { authorName = "Ada", text = "Orphan comment" },
            Ct);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    /// <summary>Proves the handler short-circuits before insert, rather than the FK producing a 500.</summary>
    [Fact]
    public async Task Post_WithUnknownTaskId_PersistsNothing()
    {
        var response = await _client.PostAsJsonAsync(
            CommentsUrl(Guid.CreateVersion7()),
            new { authorName = "Ada", text = "Orphan comment" },
            Ct);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);

        using var scope = factory.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<TaskFlowDbContext>();

        Assert.Equal(0, await context.Comments.CountAsync(Ct));
    }

    [Fact]
    public async Task Post_WithoutAuthorName_Returns400()
    {
        var taskId = await SeedTaskAsync();

        var response = await _client.PostAsJsonAsync(CommentsUrl(taskId), new { text = "Anonymous" }, Ct);

        await AssertValidationProblemAsync(response, "authorName");
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public async Task Post_WithBlankAuthorName_Returns400(string authorName)
    {
        var taskId = await SeedTaskAsync();

        var response = await _client.PostAsJsonAsync(
            CommentsUrl(taskId),
            new { authorName, text = "Anonymous" },
            Ct);

        await AssertValidationProblemAsync(response, "authorName");
    }

    [Fact]
    public async Task Post_WithAuthorNameOverMaxLength_Returns400()
    {
        var taskId = await SeedTaskAsync();

        var response = await _client.PostAsJsonAsync(
            CommentsUrl(taskId),
            new { authorName = new string('a', 101), text = "Valid" },
            Ct);

        await AssertValidationProblemAsync(response, "authorName");
    }

    [Fact]
    public async Task Post_WithAuthorNameAtMaxLength_Returns201()
    {
        var taskId = await SeedTaskAsync();

        var response = await _client.PostAsJsonAsync(
            CommentsUrl(taskId),
            new { authorName = new string('a', 100), text = "Valid" },
            Ct);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
    }

    /// <summary>
    /// Pins the reason CreateCommentRequest uses init accessors instead of positional parameters:
    /// the trim must run before [MaxLength], so padding can't reject a value the stored form fits.
    /// </summary>
    [Fact]
    public async Task Post_WithWhitespacePaddedValuesAtMaxLength_Returns201()
    {
        const int authorNameLength = 100;
        const int textLength = 2000;

        var taskId = await SeedTaskAsync();

        var response = await _client.PostAsJsonAsync(
            CommentsUrl(taskId),
            new
            {
                authorName = $"  {new string('a', authorNameLength)}  ",
                text = $"  {new string('b', textLength)}  ",
            },
            Ct);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);

        var comment = await response.Content.ReadFromJsonAsync<CommentResponseModel>(Ct);
        Assert.NotNull(comment);
        Assert.Equal(authorNameLength, comment.AuthorName.Length);
        Assert.Equal(textLength, comment.Text.Length);
    }

    /// <summary>
    /// [ApiController] short-circuits model validation before the action runs, so an invalid body
    /// beats an unknown parent. Pinned so a refactor can't silently flip it to 404.
    /// </summary>
    [Fact]
    public async Task Post_WithUnknownTaskIdAndInvalidBody_Returns400()
    {
        var response = await _client.PostAsJsonAsync(
            CommentsUrl(Guid.CreateVersion7()),
            new { authorName = "Ada", text = "" },
            Ct);

        await AssertValidationProblemAsync(response, "text");
    }

    [Fact]
    public async Task Post_WithoutText_Returns400()
    {
        var taskId = await SeedTaskAsync();

        var response = await _client.PostAsJsonAsync(CommentsUrl(taskId), new { authorName = "Ada" }, Ct);

        await AssertValidationProblemAsync(response, "text");
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public async Task Post_WithBlankText_Returns400(string text)
    {
        var taskId = await SeedTaskAsync();

        var response = await _client.PostAsJsonAsync(CommentsUrl(taskId), new { authorName = "Ada", text }, Ct);

        await AssertValidationProblemAsync(response, "text");
    }

    [Fact]
    public async Task Post_WithTextOverMaxLength_Returns400()
    {
        var taskId = await SeedTaskAsync();

        var response = await _client.PostAsJsonAsync(
            CommentsUrl(taskId),
            new { authorName = "Ada", text = new string('a', 2001) },
            Ct);

        await AssertValidationProblemAsync(response, "text");
    }

    [Fact]
    public async Task Post_WithTextAtMaxLength_Returns201()
    {
        var taskId = await SeedTaskAsync();

        var response = await _client.PostAsJsonAsync(
            CommentsUrl(taskId),
            new { authorName = "Ada", text = new string('a', 2000) },
            Ct);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
    }

    private static async Task AssertValidationProblemAsync(HttpResponseMessage response, string expectedMember)
    {
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);

        var problem = await response.Content.ReadFromJsonAsync<HttpValidationProblemDetails>(Ct);
        Assert.NotNull(problem);
        Assert.Contains(problem.Errors.Keys, key => key.Equals(expectedMember, StringComparison.OrdinalIgnoreCase));
    }

    private sealed record CommentResponseModel(
        Guid Id,
        Guid TaskId,
        string AuthorName,
        string Text,
        DateTime CreatedAtUtc);
}
