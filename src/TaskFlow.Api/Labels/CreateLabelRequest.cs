using System.ComponentModel.DataAnnotations;
using TaskFlow.Domain.Labels;

namespace TaskFlow.Api.Labels;

/// <summary>
/// Init accessor trims before validation runs, matching CreateTaskRequest. Deliberately not a
/// positional record: MVC requires validation attributes on constructor parameters and throws
/// if it finds them on properties, which would rule out this accessor.
/// </summary>
public sealed record CreateLabelRequest
{
    private readonly string _name = string.Empty;

    [Required]
    [MaxLength(Label.NameMaxLength)]
    public string Name
    {
        get => _name;
        init => _name = value?.Trim() ?? string.Empty;
    }
}
