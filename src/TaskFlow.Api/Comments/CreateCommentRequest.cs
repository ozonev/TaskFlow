using System.ComponentModel.DataAnnotations;
using TaskFlow.Domain.TaskComments;

namespace TaskFlow.Api.Comments;

/// <summary>
/// Init accessors trim before validation runs, so a value that only exceeds the limit because of
/// surrounding whitespace isn't rejected for a length the stored value wouldn't have. Deliberately
/// not a positional record: MVC requires validation attributes on constructor parameters and
/// throws if it finds them on properties, which would rule out these accessors.
/// </summary>
public sealed record CreateCommentRequest
{
    private readonly string _authorName = string.Empty;
    private readonly string _text = string.Empty;

    [Required]
    [MaxLength(TaskComment.AuthorNameMaxLength)]
    public string AuthorName
    {
        get => _authorName;
        init => _authorName = value?.Trim() ?? string.Empty;
    }

    [Required]
    [MaxLength(TaskComment.TextMaxLength)]
    public string Text
    {
        get => _text;
        init => _text = value?.Trim() ?? string.Empty;
    }
}
