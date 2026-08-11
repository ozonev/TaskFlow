using TaskFlow.Domain.AuditLogs;

namespace TaskFlow.Application.AuditLogs;

public sealed record AuditLogDto(
    Guid Id,
    Guid? ProjectId,
    Guid? TaskId,
    AuditEventType EventType,
    string Description,
    DateTime CreatedAtUtc)
{
    public static AuditLogDto FromDomain(AuditLog auditLog) => new(
        auditLog.Id,
        auditLog.ProjectId,
        auditLog.TaskId,
        auditLog.EventType,
        auditLog.Description,
        auditLog.CreatedAtUtc);
}
