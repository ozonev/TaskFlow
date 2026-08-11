using System.Text.Json.Serialization;
using TaskFlow.Application.AuditLogs;
using TaskFlow.Domain.AuditLogs;

namespace TaskFlow.Api.AuditLogs;

public sealed record AuditLogResponse(
    Guid Id,
    Guid? ProjectId,
    Guid? TaskId,
    [property: JsonConverter(typeof(JsonStringEnumConverter))] AuditEventType EventType,
    string Description,
    DateTime CreatedAtUtc)
{
    public static AuditLogResponse FromDto(AuditLogDto auditLog) => new(
        auditLog.Id,
        auditLog.ProjectId,
        auditLog.TaskId,
        auditLog.EventType,
        auditLog.Description,
        auditLog.CreatedAtUtc);
}
