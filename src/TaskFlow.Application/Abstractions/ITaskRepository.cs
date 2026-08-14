using TaskFlow.Domain.TaskItems;

namespace TaskFlow.Application.Abstractions;

public interface ITaskRepository
{
    /// <summary>Adds <b>and</b> saves — there is no separate unit of work.</summary>
    Task AddAsync(TaskItem task, CancellationToken cancellationToken);

    Task<bool> ExistsAsync(Guid id, CancellationToken cancellationToken);

    Task<TaskItem?> GetByIdAsync(Guid id, CancellationToken cancellationToken);

    Task<int> CountAsync(TaskSearchFilter filter, CancellationToken cancellationToken);

    Task<IReadOnlyList<TaskItem>> SearchAsync(
        TaskSearchFilter filter,
        int skip,
        int take,
        CancellationToken cancellationToken);
}
