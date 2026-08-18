using TaskFlow.Domain.Labels;

namespace TaskFlow.Application.Abstractions;

public interface ITaskLabelRepository
{
    /// <summary>
    /// Adds <b>and</b> saves — there is no separate unit of work. Does <b>not</b> no-op if the pair
    /// already exists: it throws on the composite-PK conflict (a <see cref="ConcurrentWriteConflictException"/>
    /// when called inside <see cref="IUnitOfWork.ExecuteInTransactionAsync"/>, a raw EF Core
    /// exception otherwise). The idempotent "re-assigning an already-assigned label is a no-op"
    /// behavior callers rely on is a property of the caller's own pre-check-then-catch orchestration
    /// (see <c>AssignTaskLabelHandler</c>) — not of this method in isolation. Call
    /// <see cref="ExistsAsync"/> first, and be ready to catch the conflict, rather than assuming a
    /// duplicate call here is safe on its own.
    /// </summary>
    Task AssignAsync(TaskLabel taskLabel, CancellationToken cancellationToken);

    Task<bool> ExistsAsync(Guid taskId, Guid labelId, CancellationToken cancellationToken);

    Task<IReadOnlyList<Label>> GetForTaskAsync(Guid taskId, CancellationToken cancellationToken);

    /// <summary>Batched lookup for a page of search/list results, keyed by task id.</summary>
    Task<ILookup<Guid, Label>> GetForTasksAsync(IReadOnlyCollection<Guid> taskIds, CancellationToken cancellationToken);
}
