using TaskFlow.Domain.Labels;

namespace TaskFlow.Application.Abstractions;

public interface ITaskLabelRepository
{
    /// <summary>Adds <b>and</b> saves — there is no separate unit of work. A no-op if the pair already exists.</summary>
    Task AssignAsync(TaskLabel taskLabel, CancellationToken cancellationToken);

    Task<bool> ExistsAsync(Guid taskId, Guid labelId, CancellationToken cancellationToken);

    Task<IReadOnlyList<Label>> GetForTaskAsync(Guid taskId, CancellationToken cancellationToken);

    /// <summary>Batched lookup for a page of search/list results, keyed by task id.</summary>
    Task<ILookup<Guid, Label>> GetForTasksAsync(IReadOnlyCollection<Guid> taskIds, CancellationToken cancellationToken);
}
