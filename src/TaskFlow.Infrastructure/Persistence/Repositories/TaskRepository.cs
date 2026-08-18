using Microsoft.EntityFrameworkCore;
using TaskFlow.Application.Abstractions;
using TaskFlow.Domain.Labels;
using TaskFlow.Domain.TaskItems;

namespace TaskFlow.Infrastructure.Persistence.Repositories;

public sealed class TaskRepository(TaskFlowDbContext context) : ITaskRepository
{
    public async Task AddAsync(TaskItem task, CancellationToken cancellationToken)
    {
        context.Tasks.Add(task);

        await context.SaveChangesAsync(cancellationToken);
    }

    public async Task<bool> ExistsAsync(Guid id, CancellationToken cancellationToken) =>
        await context.Tasks.AnyAsync(task => task.Id == id, cancellationToken);

    public async Task<TaskItem?> GetByIdAsync(Guid id, CancellationToken cancellationToken) =>
        await context.Tasks.AsNoTracking().FirstOrDefaultAsync(task => task.Id == id, cancellationToken);

    public async Task<int> CountAsync(TaskSearchFilter filter, CancellationToken cancellationToken) =>
        await ApplyFilter(context.Tasks, filter).CountAsync(cancellationToken);

    public async Task<IReadOnlyList<TaskItem>> SearchAsync(
        TaskSearchFilter filter,
        int skip,
        int take,
        CancellationToken cancellationToken) =>
        await ApplyFilter(context.Tasks.AsNoTracking(), filter)
            .OrderBy(task => task.CreatedAtUtc)
            .ThenBy(task => task.Id)
            .Skip(skip)
            .Take(take)
            .ToListAsync(cancellationToken);

    /// <summary>
    /// .ToLower() on both sides rather than EF.Functions.Like, so the title filter is
    /// case-insensitive identically on SQLite (case-insensitive LIKE by default) and Postgres
    /// (case-sensitive LIKE by default) instead of behaving differently per provider.
    /// </summary>
    private IQueryable<TaskItem> ApplyFilter(IQueryable<TaskItem> query, TaskSearchFilter filter)
    {
        if (filter.ProjectId is { } projectId)
        {
            query = query.Where(task => task.ProjectId == projectId);
        }

        if (filter.Status is { } status)
        {
            query = query.Where(task => task.Status == status);
        }

        if (filter.DueDateFrom is { } dueDateFrom)
        {
            // Lifted nullable comparison: false (excluded) when DueDate is null, same as an
            // explicit "task.DueDate != null &&" guard, without the redundant extra predicate.
            query = query.Where(task => task.DueDate >= dueDateFrom);
        }

        if (filter.DueDateTo is { } dueDateTo)
        {
            query = query.Where(task => task.DueDate <= dueDateTo);
        }

        if (!string.IsNullOrWhiteSpace(filter.Title))
        {
            var loweredTitle = filter.Title.ToLower();
            query = query.Where(task => task.Title.ToLower().Contains(loweredTitle));
        }

        if (filter.LabelId is { } labelId)
        {
            query = query.Where(task => context.TaskLabels.Any(tl => tl.TaskId == task.Id && tl.LabelId == labelId));
        }

        return query;
    }
}
