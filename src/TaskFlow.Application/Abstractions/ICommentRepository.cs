using TaskFlow.Domain.TaskComments;

namespace TaskFlow.Application.Abstractions;

public interface ICommentRepository
{
    /// <summary>Adds <b>and</b> saves — there is no separate unit of work.</summary>
    Task AddAsync(TaskComment comment, CancellationToken cancellationToken);

    /// <summary>Oldest first, tie-broken by Id so repeated calls return a stable order.</summary>
    Task<IReadOnlyList<TaskComment>> GetByTaskIdAsync(Guid taskId, CancellationToken cancellationToken);
}
