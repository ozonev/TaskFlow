namespace TaskFlow.Domain.Labels;

public sealed class Label
{
    public const int NameMaxLength = 50;

    private Label()
    {
    }

    public Guid Id { get; private set; }

    public Guid ProjectId { get; private set; }

    public string Name { get; private set; } = string.Empty;

    public DateTime CreatedAtUtc { get; private set; }

    /// <summary>
    /// The guards here protect the invariant; they are not the request-validation
    /// gate — bad HTTP input is rejected at the Api boundary before reaching this.
    /// Duplicate-name rejection is also not here: it needs a repository round-trip,
    /// so it lives in CreateLabelHandler.
    /// </summary>
    public static Label Create(Guid projectId, string name)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(name);

        var trimmedName = name.Trim();
        if (trimmedName.Length > NameMaxLength)
        {
            throw new ArgumentException($"Name must be {NameMaxLength} characters or fewer.", nameof(name));
        }

        return new Label
        {
            Id = Guid.CreateVersion7(),
            ProjectId = projectId,
            Name = trimmedName,
            CreatedAtUtc = DateTime.UtcNow,
        };
    }
}
