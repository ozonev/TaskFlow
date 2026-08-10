using TaskFlow.Application.Abstractions;

namespace TaskFlow.Application.AuditLogs;

public sealed class GetTaskAuditLogHandler(IAuditLogRepository auditLogRepository, ITaskRepository taskRepository)
{
    /// <summary>Null means the task does not exist; an empty list means it exists with no audit history.</summary>
    public async Task<IReadOnlyList<AuditLogDto>?> HandleAsync(Guid taskId, CancellationToken cancellationToken)
    {
        if (!await taskRepository.ExistsAsync(taskId, cancellationToken))
        {
            return null;
        }

        var auditLogs = await auditLogRepository.ListByTaskIdAsync(taskId, cancellationToken);

        return [.. auditLogs.Select(AuditLogDto.FromDomain)];
    }
}
