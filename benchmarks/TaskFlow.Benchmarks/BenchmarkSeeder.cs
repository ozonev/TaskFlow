using Microsoft.EntityFrameworkCore;
using TaskFlow.Domain.Projects;
using TaskFlow.Domain.TaskItems;
using TaskFlow.Infrastructure;

namespace TaskFlow.Benchmarks;

internal static class BenchmarkSeeder
{
    private const int BatchSize = 2_000;

    private static readonly string[] TitlePhrases =
    [
        "Set up CI pipeline", "Fix login bug", "Write onboarding docs", "Update dependencies",
        "Design new dashboard", "Investigate memory leak", "Refactor payment module", "Add rate limiting",
        "Improve error messages", "Migrate to new API", "Clean up test data", "Optimize database queries",
        "Add dark mode support", "Fix flaky test", "Write integration tests", "Update release notes",
        "Handle edge case in parser", "Add retry logic", "Improve accessibility", "Tune cache eviction",
        "Add audit logging", "Fix timezone handling", "Reduce bundle size", "Add feature flag",
        "Prepare quarterly report",
    ];

    /// <summary>Returns the Id of a seeded project with a representative share of the seeded tasks.</summary>
    public static Guid Seed(TaskFlowDbContext context, int projectCount, int taskCount)
    {
        var random = new Random(42);

        var projects = Enumerable.Range(1, projectCount)
            .Select(i => Project.Create($"Benchmark Project {i}", description: null))
            .ToArray();
        context.Projects.AddRange(projects);
        context.SaveChanges();
        context.ChangeTracker.Clear();

        var projectIds = projects.Select(p => p.Id).ToArray();

        for (var batchStart = 0; batchStart < taskCount; batchStart += BatchSize)
        {
            var batchLength = Math.Min(BatchSize, taskCount - batchStart);
            var batch = new List<TaskItem>(batchLength);

            for (var i = 0; i < batchLength; i++)
            {
                var index = batchStart + i;
                var projectId = projectIds[index % projectIds.Length];
                var phrase = TitlePhrases[index % TitlePhrases.Length];
                var title = index % 13 == 0 ? $"{phrase} — review" : $"{phrase} #{index}";
                DateTime? dueDate = index % 10 < 7 ? DateTime.UtcNow.AddDays(random.Next(-365, 366)) : null;

                batch.Add(TaskItem.Create(projectId, title, description: null, dueDate));
            }

            context.Tasks.AddRange(batch);
            context.SaveChanges();
            context.ChangeTracker.Clear();
        }

        // TaskItem.Create always stamps CreatedAtUtc = DateTime.UtcNow with no override hook, and
        // Domain must stay persistence-ignorant, so spread it across a realistic ~1-year window
        // with one set-based UPDATE instead of adding a benchmark-only setter to the entity.
        context.Database.ExecuteSqlRaw(
            "UPDATE Tasks SET CreatedAtUtc = datetime('2025-01-01', ((abs(random()) % 730) - 365) || ' days')");

        return projectIds[0];
    }
}
