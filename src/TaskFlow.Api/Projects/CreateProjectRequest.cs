using System.ComponentModel.DataAnnotations;
using TaskFlow.Domain.Projects;

namespace TaskFlow.Api.Projects;

/// <summary>
/// Init accessors trim before validation runs, so a value that only exceeds the limit because of
/// surrounding whitespace isn't rejected for a length the stored value wouldn't have. Deliberately
/// not a positional record: MVC requires validation attributes on constructor parameters and
/// throws if it finds them on properties, which would rule out these accessors.
/// </summary>
public sealed record CreateProjectRequest
{
    private readonly string _name = string.Empty;
    private readonly string? _description;

    [Required]
    [MaxLength(Project.NameMaxLength)]
    public string Name
    {
        get => _name;
        init => _name = value?.Trim() ?? string.Empty;
    }

    [MaxLength(Project.DescriptionMaxLength)]
    public string? Description
    {
        get => _description;
        init => _description = value?.Trim();
    }
}
