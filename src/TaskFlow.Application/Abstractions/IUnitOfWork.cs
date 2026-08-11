namespace TaskFlow.Application.Abstractions;

public interface IUnitOfWork
{
    /// <summary>
    /// Runs <paramref name="operation"/> inside a database transaction, committing only if it
    /// completes without throwing. Use when a handler calls more than one repository's AddAsync
    /// for what should be a single atomic write (e.g. an entity plus its audit log row).
    /// </summary>
    Task ExecuteInTransactionAsync(Func<CancellationToken, Task> operation, CancellationToken cancellationToken);
}
