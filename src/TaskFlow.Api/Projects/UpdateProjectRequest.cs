using System.ComponentModel.DataAnnotations;
using TaskFlow.Domain.Projects;

namespace TaskFlow.Api.Projects;

/// <summary>
/// Both fields are optional: omitted (null) means "leave unchanged". A non-null value is applied,
/// including an empty string, which clears <see cref="Description"/> — see <see cref="Project.Update"/>.
/// <see cref="Name"/> has no such clear option since the domain forbids a blank name, hence
/// <c>MinimumLength = 1</c> — <see cref="StringLengthAttribute"/> skips validation for a null value,
/// so omitting <see cref="Name"/> entirely still passes.
/// </summary>
public sealed record UpdateProjectRequest
{
    private readonly string? _name;
    private readonly string? _description;

    [StringLength(Project.NameMaxLength, MinimumLength = 1)]
    public string? Name
    {
        get => _name;
        init => _name = value?.Trim();
    }

    [MaxLength(Project.DescriptionMaxLength)]
    public string? Description
    {
        get => _description;
        init => _description = value?.Trim();
    }
}
