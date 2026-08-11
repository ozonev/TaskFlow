namespace TaskFlow.Domain.Projects;

public sealed class Project
{
    public const int NameMaxLength = 100;
    public const int DescriptionMaxLength = 500;

    private Project()
    {
    }

    public Guid Id { get; private set; }

    public string Name { get; private set; } = string.Empty;

    public string? Description { get; private set; }

    public DateTime CreatedAtUtc { get; private set; }

    /// <summary>
    /// The guards here protect the invariant; they are not the request-validation
    /// gate — bad HTTP input is rejected at the Api boundary before reaching this.
    /// </summary>
    public static Project Create(string name, string? description) =>
        new()
        {
            Id = Guid.CreateVersion7(),
            Name = ValidateName(name),
            Description = NormalizeDescription(description),
            CreatedAtUtc = DateTime.UtcNow,
        };

    /// <summary>
    /// A null argument leaves the corresponding field unchanged; a non-null argument
    /// (including an empty/whitespace description) replaces it, matching <see cref="Create"/>'s
    /// blank-description-becomes-null normalization. Both arguments are validated before either
    /// field is assigned, so a rejected description can't leave a new name partially applied.
    /// </summary>
    public void Update(string? name, string? description)
    {
        var validatedName = name is not null ? ValidateName(name) : null;
        var normalizedDescription = description is not null ? NormalizeDescription(description) : null;

        if (name is not null)
        {
            Name = validatedName!;
        }

        if (description is not null)
        {
            Description = normalizedDescription;
        }
    }

    private static string ValidateName(string name)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(name);

        var trimmedName = name.Trim();
        if (trimmedName.Length > NameMaxLength)
        {
            throw new ArgumentException($"Name must be {NameMaxLength} characters or fewer.", nameof(name));
        }

        return trimmedName;
    }

    private static string? NormalizeDescription(string? description)
    {
        var trimmedDescription = string.IsNullOrWhiteSpace(description) ? null : description.Trim();
        if (trimmedDescription?.Length > DescriptionMaxLength)
        {
            throw new ArgumentException(
                $"Description must be {DescriptionMaxLength} characters or fewer.",
                nameof(description));
        }

        return trimmedDescription;
    }
}
