using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using TaskFlow.Domain.Projects;
using TaskFlow.Infrastructure;

namespace TaskFlow.Tests.Api;

[Collection(ProjectsApiCollection.Name)]
public sealed class ListProjectsEndpointTests(TaskFlowApiFactory factory) : IAsyncLifetime
{
    private const string Url = "/api/projects";

    private static readonly DateTime BaseTimestamp = new(2026, 1, 1, 12, 0, 0, DateTimeKind.Utc);

    private readonly HttpClient _client = factory.CreateClient();

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    /// <summary>Empties the shared in-memory database so tests can't observe each other's rows.</summary>
    public async ValueTask InitializeAsync()
    {
        using var scope = factory.CreateScope();
        await scope.ServiceProvider.GetRequiredService<TaskFlowDbContext>()
            .Projects.ExecuteDeleteAsync(Ct);
    }

    public ValueTask DisposeAsync() => ValueTask.CompletedTask;

    /// <summary>
    /// Accepts an explicit <paramref name="createdAtUtc"/> rather than relying on consecutive
    /// DateTime.UtcNow reads differing — on a host with a coarse (~15.6 ms) system timer those
    /// would tie, and the Id tie-break is stable but not chronological.
    /// </summary>
    private async Task<Project> SeedProjectAsync(string name, string? description, DateTime? createdAtUtc = null)
    {
        using var scope = factory.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<TaskFlowDbContext>();

        var project = Project.Create(name, description);
        context.Projects.Add(project);
        await context.SaveChangesAsync(Ct);

        if (createdAtUtc is not null)
        {
            await context.Projects
                .Where(seeded => seeded.Id == project.Id)
                .ExecuteUpdateAsync(
                    setters => setters.SetProperty(seeded => seeded.CreatedAtUtc, createdAtUtc.Value),
                    Ct);
        }

        return project;
    }

    private async Task<ProjectListResponseModel> GetProjectsAsync(string query = "")
    {
        var response = await _client.GetAsync(Url + query, Ct);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var body = await response.Content.ReadFromJsonAsync<ProjectListResponseModel>(Ct);
        Assert.NotNull(body);

        return body;
    }

    [Fact]
    public async Task List_WithNoProjects_Returns200WithEmptyItemsAndZeroTotals()
    {
        var result = await GetProjectsAsync();

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
    public async Task List_WithDefaultPaging_ReturnsProjectsOrderedByCreatedAtThenId()
    {
        await SeedProjectAsync("Third", null, BaseTimestamp.AddMinutes(2));
        await SeedProjectAsync("First", null, BaseTimestamp);
        await SeedProjectAsync("Second", null, BaseTimestamp.AddMinutes(1));

        var result = await GetProjectsAsync();

        Assert.Equal(["First", "Second", "Third"], result.Items.Select(item => item.Name));
    }

    [Fact]
    public async Task List_WithPageAndPageSize_ReturnsRequestedSliceAndCorrectEnvelope()
    {
        for (var i = 0; i < 5; i++)
        {
            await SeedProjectAsync($"Project {i}", null, BaseTimestamp.AddMinutes(i));
        }

        var result = await GetProjectsAsync("?page=2&pageSize=2");

        Assert.Equal(["Project 2", "Project 3"], result.Items.Select(item => item.Name));
        Assert.Equal(2, result.Page);
        Assert.Equal(2, result.PageSize);
        Assert.Equal(5, result.TotalCount);
        Assert.Equal(3, result.TotalPages);
    }

    [Fact]
    public async Task List_WithPageBeyondRange_Returns200WithEmptyItemsButCorrectTotals()
    {
        await SeedProjectAsync("Apollo", null, BaseTimestamp);
        await SeedProjectAsync("Zephyr", null, BaseTimestamp.AddMinutes(1));

        var result = await GetProjectsAsync("?page=5&pageSize=20");

        Assert.Empty(result.Items);
        Assert.Equal(2, result.TotalCount);
        Assert.Equal(1, result.TotalPages);
    }

    /// <summary>
    /// Pins the fix for (Page - 1) * PageSize overflowing Int32 and wrapping negative for huge but
    /// validation-legal Page values, which used to make Skip silently clamp back to 0 and return
    /// page-1 data mislabeled under the requested page.
    /// </summary>
    [Fact]
    public async Task List_WithPageCausingSkipOverflow_Returns200WithEmptyItemsAndUnaffectedTotals()
    {
        await SeedProjectAsync("Apollo", null, BaseTimestamp);
        await SeedProjectAsync("Zephyr", null, BaseTimestamp.AddMinutes(1));

        var result = await GetProjectsAsync("?page=2147483647&pageSize=100");

        Assert.Empty(result.Items);
        Assert.Equal(2147483647, result.Page);
        Assert.Equal(2, result.TotalCount);
    }

    /// <summary>
    /// Pins the ThenBy(Id) tie-break that IProjectRepository.ListAsync promises: with equal
    /// timestamps the order is Id-ascending and identical across calls, rather than whatever the
    /// provider happens to return.
    /// </summary>
    [Fact]
    public async Task List_WithTiedTimestamps_OrdersByIdRepeatably()
    {
        await SeedProjectAsync("Ada", null);
        await SeedProjectAsync("Grace", null);
        await SeedProjectAsync("Alan", null);

        var tiedTimestamp = new DateTime(2026, 1, 1, 12, 0, 0, DateTimeKind.Utc);

        using (var scope = factory.CreateScope())
        {
            var context = scope.ServiceProvider.GetRequiredService<TaskFlowDbContext>();
            await context.Projects.ExecuteUpdateAsync(
                setters => setters.SetProperty(project => project.CreatedAtUtc, tiedTimestamp),
                Ct);
        }

        var first = await GetProjectsAsync();
        var second = await GetProjectsAsync();

        var expected = first.Items.Select(item => item.Id).Order().ToArray();
        Assert.Equal(expected, first.Items.Select(item => item.Id));
        Assert.Equal(expected, second.Items.Select(item => item.Id));
    }

    /// <summary>
    /// The Kind assertion is the part that pins .HasUtcConversion(): without it SQLite reads the
    /// value back Unspecified, which serializes without the trailing Z and deserializes back to
    /// Unspecified. Ticks would still match, since DateTime equality ignores Kind.
    /// </summary>
    [Fact]
    public async Task List_RoundTripsCreatedAtUtcFromDatabase()
    {
        var seeded = await SeedProjectAsync("Round trip", null);

        var result = await GetProjectsAsync();

        var project = Assert.Single(result.Items);
        Assert.Equal(seeded.CreatedAtUtc, project.CreatedAtUtc);
        Assert.Equal(DateTimeKind.Utc, project.CreatedAtUtc.Kind);
    }

    [Fact]
    public async Task List_ReturnsProjectCreatedByPost()
    {
        var response = await _client.PostAsJsonAsync(Url, new { name = "Posted then listed" }, Ct);
        response.EnsureSuccessStatusCode();

        var posted = await response.Content.ReadFromJsonAsync<ProjectResponseModel>(Ct);
        Assert.NotNull(posted);

        var result = await GetProjectsAsync();

        var fetched = Assert.Single(result.Items);
        Assert.Equal(posted, fetched);
    }

    [Fact]
    public async Task List_WithPageLessThanOne_Returns400()
    {
        var response = await _client.GetAsync(Url + "?page=0", Ct);

        await AssertValidationProblemAsync(response, "page");
    }

    [Fact]
    public async Task List_WithPageSizeLessThanOne_Returns400()
    {
        var response = await _client.GetAsync(Url + "?pageSize=0", Ct);

        await AssertValidationProblemAsync(response, "pageSize");
    }

    [Fact]
    public async Task List_WithPageSizeAboveCap_Returns400()
    {
        var response = await _client.GetAsync(Url + "?pageSize=101", Ct);

        await AssertValidationProblemAsync(response, "pageSize");
    }

    [Fact]
    public async Task List_WithNonIntegerPage_Returns400()
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

    private sealed record ProjectListResponseModel(
        ProjectResponseModel[] Items, int Page, int PageSize, int TotalCount, int TotalPages);

    private sealed record ProjectResponseModel(Guid Id, string Name, string? Description, DateTime CreatedAtUtc);
}
