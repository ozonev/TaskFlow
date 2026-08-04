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
    public static Project Create(string name, string? description)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(name);

        var trimmedName = name.Trim();
        if (trimmedName.Length > NameMaxLength)
        {
            throw new ArgumentException($"Name must be {NameMaxLength} characters or fewer.", nameof(name));
        }

        var trimmedDescription = string.IsNullOrWhiteSpace(description) ? null : description.Trim();
        if (trimmedDescription?.Length > DescriptionMaxLength)
        {
            throw new ArgumentException(
                $"Description must be {DescriptionMaxLength} characters or fewer.",
                nameof(description));
        }

        return new Project
        {
            Id = Guid.CreateVersion7(),
            Name = trimmedName,
            Description = trimmedDescription,
            CreatedAtUtc = DateTime.UtcNow,
        };
    }
}
