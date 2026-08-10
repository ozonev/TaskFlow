using Microsoft.EntityFrameworkCore;
using TaskFlow.Application.Abstractions;
using TaskFlow.Domain.AuditLogs;

namespace TaskFlow.Infrastructure.Persistence.Repositories;

public sealed class AuditLogRepository(TaskFlowDbContext context) : IAuditLogRepository
{
    public async Task AddAsync(AuditLog auditLog, CancellationToken cancellationToken)
    {
        context.AuditLogs.Add(auditLog);

        await context.SaveChangesAsync(cancellationToken);
    }

    public async Task<IReadOnlyList<AuditLog>> ListByTaskIdAsync(Guid taskId, CancellationToken cancellationToken) =>
        await context.AuditLogs.AsNoTracking()
            .Where(auditLog => auditLog.TaskId == taskId)
            .OrderBy(auditLog => auditLog.CreatedAtUtc)
            .ThenBy(auditLog => auditLog.Id)
            .ToListAsync(cancellationToken);

    public async Task<IReadOnlyList<AuditLog>> ListByProjectIdAsync(
        Guid projectId,
        CancellationToken cancellationToken) =>
        await context.AuditLogs.AsNoTracking()
            .Where(auditLog => auditLog.ProjectId == projectId)
            .OrderBy(auditLog => auditLog.CreatedAtUtc)
            .ThenBy(auditLog => auditLog.Id)
            .ToListAsync(cancellationToken);
}
