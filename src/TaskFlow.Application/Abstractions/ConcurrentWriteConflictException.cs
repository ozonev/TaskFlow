namespace TaskFlow.Application.Abstractions;

/// <summary>
/// Thrown by <see cref="IUnitOfWork.ExecuteInTransactionAsync"/> when the write inside the
/// transaction fails because it conflicted with a concurrent write — e.g. a unique-constraint
/// violation from a simultaneous identical insert. Infrastructure translates the real provider
/// exception (EF Core's DbUpdateException) into this so Application-layer handlers can react to
/// "lost a race" without taking a dependency on EF Core.
/// </summary>
public sealed class ConcurrentWriteConflictException(Exception innerException)
    : Exception("A concurrent write conflicted with this operation.", innerException);
