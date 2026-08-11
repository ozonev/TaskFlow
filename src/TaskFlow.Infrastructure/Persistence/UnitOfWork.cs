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

        await operation(cancellationToken);

        await transaction.CommitAsync(cancellationToken);
    }
}
