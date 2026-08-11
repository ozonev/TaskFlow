namespace TaskFlow.Domain.TaskComments;

public sealed class TaskComment
{
    public const int AuthorNameMaxLength = 100;
    public const int TextMaxLength = 2000;

    private TaskComment()
    {
    }

    public Guid Id { get; private set; }
    public Guid TaskId { get; private set; }
    public string AuthorName { get; private set; } = string.Empty;
    public string Text { get; private set; } = string.Empty;
    public DateTime CreatedAtUtc { get; private set; }

    /// <summary>
    /// The guards here protect the invariant; they are not the request-validation
    /// gate — bad HTTP input is rejected at the Api boundary before reaching this.
    /// </summary>
    public static TaskComment Create(Guid taskId, string authorName, string text)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(authorName);
        ArgumentException.ThrowIfNullOrWhiteSpace(text);

        var trimmedAuthorName = authorName.Trim();
        if (trimmedAuthorName.Length > AuthorNameMaxLength)
        {
            throw new ArgumentException(
                $"Author name must be {AuthorNameMaxLength} characters or fewer.",
                nameof(authorName));
        }

        var trimmedText = text.Trim();
        if (trimmedText.Length > TextMaxLength)
        {
            throw new ArgumentException($"Text must be {TextMaxLength} characters or fewer.", nameof(text));
        }

        return new TaskComment
        {
            Id = Guid.CreateVersion7(),
            TaskId = taskId,
            AuthorName = trimmedAuthorName,
            Text = trimmedText,
            CreatedAtUtc = DateTime.UtcNow,
        };
    }
}
