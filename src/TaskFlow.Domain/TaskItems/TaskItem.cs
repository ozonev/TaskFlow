namespace TaskFlow.Domain.TaskItems;

public sealed class TaskItem
{
    public const int TitleMaxLength = 200;
    public const int DescriptionMaxLength = 2000;

    private TaskItem()
    {
    }

    public Guid Id { get; private set; }

    public Guid ProjectId { get; private set; }

    public string Title { get; private set; } = string.Empty;

    public string? Description { get; private set; }

    public TaskItemStatus Status { get; private set; }

    public DateTime? DueDate { get; private set; }

    public DateTime CreatedAtUtc { get; private set; }

    /// <summary>
    /// The guards here protect the invariant; they are not the request-validation
    /// gate — bad HTTP input is rejected at the Api boundary before reaching this.
    /// </summary>
    public static TaskItem Create(Guid projectId, string title, string? description, DateTime? dueDate)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(title);

        var trimmedTitle = title.Trim();
        if (trimmedTitle.Length > TitleMaxLength)
        {
            throw new ArgumentException($"Title must be {TitleMaxLength} characters or fewer.", nameof(title));
        }

        var trimmedDescription = string.IsNullOrWhiteSpace(description) ? null : description.Trim();
        if (trimmedDescription?.Length > DescriptionMaxLength)
        {
            throw new ArgumentException(
                $"Description must be {DescriptionMaxLength} characters or fewer.",
                nameof(description));
        }

        return new TaskItem
        {
            Id = Guid.CreateVersion7(),
            ProjectId = projectId,
            Title = trimmedTitle,
            Description = trimmedDescription,
            Status = TaskItemStatus.Todo,
            DueDate = NormalizeToUtc(dueDate),
            CreatedAtUtc = DateTime.UtcNow,
        };
    }

    /// <summary>
    /// Persistence always reads DueDate back labeled Utc (see TaskItemConfiguration), so an
    /// unconverted Local/Unspecified value here would silently misrepresent the stored instant.
    /// Unspecified is treated as already-Utc rather than the host's local zone, since the API
    /// has no notion of a client time zone to convert from.
    /// </summary>
    private static DateTime? NormalizeToUtc(DateTime? value) => value switch
    {
        null => null,
        { Kind: DateTimeKind.Unspecified } => DateTime.SpecifyKind(value.Value, DateTimeKind.Utc),
        _ => value.Value.ToUniversalTime(),
    };
}
