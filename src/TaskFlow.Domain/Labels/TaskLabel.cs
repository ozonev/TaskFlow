namespace TaskFlow.Domain.Labels;

/// <summary>
/// Join row for the Task-to-Label many-to-many relationship. A plain record of the
/// association, not a nav-property-based EF many-to-many — matching this codebase's
/// FK-scalar, no-nav-property convention (see TaskItem/TaskComment).
/// </summary>
public sealed class TaskLabel
{
    private TaskLabel()
    {
    }

    public Guid TaskId { get; private set; }

    public Guid LabelId { get; private set; }

    public DateTime CreatedAtUtc { get; private set; }

    public static TaskLabel Create(Guid taskId, Guid labelId) =>
        new()
        {
            TaskId = taskId,
            LabelId = labelId,
            CreatedAtUtc = DateTime.UtcNow,
        };
}
