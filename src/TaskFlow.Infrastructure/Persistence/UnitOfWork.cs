using Microsoft.EntityFrameworkCore;
using TaskFlow.Application.Abstractions;

namespace TaskFlow.Infrastructure.Persistence;

public sealed class UnitOfWork(TaskFlowDbContext context) : IUnitOfWork
{
    public async Task ExecuteInTransactionAsync(
        Func<CancellationToken, Task> operation,
        CancellationToken cancellationToken)
    {
        await using var transaction = await context.Database.BeginTransactionAsync(cancellationToken);

        try
        {
            await operation(cancellationToken);
            await transaction.CommitAsync(cancellationToken);
        }
        catch (DbUpdateException ex)
        {
            // Wrapped rather than left as DbUpdateException so Application-layer callers can catch
            // it without an EF Core reference. Thrown from inside this try means the `await using`
            // above rolls the transaction back (an uncommitted transaction's DisposeAsync issues a
            // ROLLBACK) before this propagates — a caller's recovery query runs against a clean,
            // non-aborted transaction rather than one a provider like Postgres has already poisoned.
            throw new ConcurrentWriteConflictException(ex);
        }
    }
}
