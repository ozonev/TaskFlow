namespace TaskFlow.Domain.AuditLogs;

public sealed class AuditLog
{
    public const int DescriptionMaxLength = 500;

    private AuditLog()
    {
    }

    public Guid Id { get; private set; }
    public Guid? ProjectId { get; private set; }
    public Guid? TaskId { get; private set; }
    public AuditEventType EventType { get; private set; }
    public string Description { get; private set; } = string.Empty;
    public DateTime CreatedAtUtc { get; private set; }

    public static AuditLog Create(Guid? projectId, Guid? taskId, AuditEventType eventType, string description)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(description);

        var trimmedDescription = description.Trim();
        if (trimmedDescription.Length > DescriptionMaxLength)
        {
            throw new ArgumentException(
                $"Description must be {DescriptionMaxLength} characters or fewer.",
                nameof(description));
        }

        return new AuditLog
        {
            Id = Guid.CreateVersion7(),
            ProjectId = projectId,
            TaskId = taskId,
            EventType = eventType,
            Description = trimmedDescription,
            CreatedAtUtc = DateTime.UtcNow,
        };
    }
}
