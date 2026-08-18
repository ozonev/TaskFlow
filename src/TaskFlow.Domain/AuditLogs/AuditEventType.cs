namespace TaskFlow.Domain.AuditLogs;

public enum AuditEventType
{
    ProjectCreated,
    TaskCreated,
    TaskCommentAdded,
    LabelCreated,
    TaskLabelAssigned,
}
