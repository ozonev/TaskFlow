using BenchmarkDotNet.Attributes;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using TaskFlow.Application.Abstractions;
using TaskFlow.Application.Tasks;
using TaskFlow.Domain.TaskItems;
using TaskFlow.Infrastructure;
using TaskFlow.Infrastructure.Persistence.Repositories;

namespace TaskFlow.Benchmarks;

[MemoryDiagnoser]
[SimpleJob(warmupCount: 3, iterationCount: 10)]
public class TaskSearchBenchmarks
{
    private static readonly TaskSearchFilter NoFilter = new(
        ProjectId: null, Status: null, DueDateFrom: null, DueDateTo: null, Title: null);

    private string _dbPath = null!;
    private TaskFlowDbContext _context = null!;
    private SearchTasksHandler _handler = null!;
    private Guid _seededProjectId;

    [GlobalSetup]
    public void Setup()
    {
        _dbPath = Path.Combine(Path.GetTempPath(), $"taskflow-bench-{Guid.NewGuid():N}.db");
        var options = new DbContextOptionsBuilder<TaskFlowDbContext>()
            .UseSqlite($"Data Source={_dbPath}")
            .Options;
        _context = new TaskFlowDbContext(options);
        _context.Database.Migrate();

        _seededProjectId = BenchmarkSeeder.Seed(_context, projectCount: 30, taskCount: 50_000);
        _handler = new SearchTasksHandler(new TaskRepository(_context), new TaskLabelRepository(_context));
    }

    [GlobalCleanup]
    public void Cleanup()
    {
        _context.Dispose();

        // Microsoft.Data.Sqlite pools connections by default, so the file handle can outlive
        // context.Dispose() — clear the pool first or File.Delete throws "used by another process".
        SqliteConnection.ClearAllPools();
        File.Delete(_dbPath);
    }

    [Benchmark]
    public Task<SearchTasksResult> NoFilter_FirstPage() => Run(NoFilter, page: 1);

    [Benchmark]
    public Task<SearchTasksResult> NoFilter_DeepPage() => Run(NoFilter, page: 1_000);

    [Benchmark]
    public Task<SearchTasksResult> ProjectIdFilter() => Run(NoFilter with { ProjectId = _seededProjectId }, page: 1);

    [Benchmark]
    public Task<SearchTasksResult> StatusFilter() => Run(NoFilter with { Status = TaskItemStatus.Todo }, page: 1);

    [Benchmark]
    public Task<SearchTasksResult> DueDateRangeFilter() =>
        Run(NoFilter with { DueDateFrom = DateTime.UtcNow.AddDays(-30), DueDateTo = DateTime.UtcNow.AddDays(30) }, page: 1);

    [Benchmark]
    public Task<SearchTasksResult> TitleContainsFilter() => Run(NoFilter with { Title = "review" }, page: 1);

    [Benchmark]
    public Task<SearchTasksResult> CombinedFilters() => Run(
        NoFilter with
        {
            ProjectId = _seededProjectId,
            Status = TaskItemStatus.Todo,
            DueDateFrom = DateTime.UtcNow.AddDays(-30),
            DueDateTo = DateTime.UtcNow.AddDays(30),
            Title = "review",
        },
        page: 1);

    private Task<SearchTasksResult> Run(TaskSearchFilter filter, int page) =>
        _handler.HandleAsync(new SearchTasksQuery(filter, page, PageSize: 25), CancellationToken.None);
}
