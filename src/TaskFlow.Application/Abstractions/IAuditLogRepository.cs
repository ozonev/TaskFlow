using TaskFlow.Domain.AuditLogs;

namespace TaskFlow.Application.Abstractions;

public interface IAuditLogRepository
{
    /// <summary>Adds <b>and</b> saves — there is no separate unit of work.</summary>
    Task AddAsync(AuditLog auditLog, CancellationToken cancellationToken);

    /// <summary>Oldest first, tie-broken by Id so repeated calls return a stable order.</summary>
    Task<IReadOnlyList<AuditLog>> ListByTaskIdAsync(Guid taskId, CancellationToken cancellationToken);

    /// <summary>Oldest first, tie-broken by Id so repeated calls return a stable order.</summary>
    Task<IReadOnlyList<AuditLog>> ListByProjectIdAsync(Guid projectId, CancellationToken cancellationToken);
}
