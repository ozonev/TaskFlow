using System.ComponentModel.DataAnnotations;
using TaskFlow.Domain.TaskItems;

namespace TaskFlow.Api.Tasks;

/// <summary>
/// Init accessors trim before validation runs, so a value that only exceeds the limit because of
/// surrounding whitespace isn't rejected for a length the stored value wouldn't have. Deliberately
/// not a positional record: MVC requires validation attributes on constructor parameters and
/// throws if it finds them on properties, which would rule out these accessors.
/// </summary>
public sealed record CreateTaskRequest
{
    private readonly string _title = string.Empty;
    private readonly string? _description;

    [Required]
    [MaxLength(TaskItem.TitleMaxLength)]
    public string Title
    {
        get => _title;
        init => _title = value?.Trim() ?? string.Empty;
    }

    [MaxLength(TaskItem.DescriptionMaxLength)]
    public string? Description
    {
        get => _description;
        init => _description = value?.Trim();
    }

    public DateTime? DueDate { get; init; }
}
