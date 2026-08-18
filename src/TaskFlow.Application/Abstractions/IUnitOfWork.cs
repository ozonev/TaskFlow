namespace TaskFlow.Application.Abstractions;

public interface IUnitOfWork
{
    /// <summary>
    /// Runs <paramref name="operation"/> inside a database transaction, committing only if it
    /// completes without throwing. Use when a handler calls more than one repository's AddAsync
    /// for what should be a single atomic write (e.g. an entity plus its audit log row).
    /// </summary>
    /// <exception cref="ConcurrentWriteConflictException">
    /// The transaction failed because a write inside it conflicted with a concurrent write (e.g. a
    /// unique-constraint violation). The transaction has already been rolled back and disposed by
    /// the time this is thrown, so the caller can safely re-query to decide how to respond.
    /// </exception>
    Task ExecuteInTransactionAsync(Func<CancellationToken, Task> operation, CancellationToken cancellationToken);
}
