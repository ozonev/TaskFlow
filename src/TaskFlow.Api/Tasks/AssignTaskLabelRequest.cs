using System.ComponentModel.DataAnnotations;

namespace TaskFlow.Api.Tasks;

/// <summary>
/// <see cref="LabelId"/> is a nullable Guid specifically so <see cref="RequiredAttribute"/> can
/// catch an omitted/null value — on a non-nullable Guid, a missing JSON property model-binds to
/// Guid.Empty, which [Required] treats as present, so the request would 404 (label not found)
/// instead of 400 (label id is required).
/// </summary>
public sealed record AssignTaskLabelRequest
{
    [Required]
    public Guid? LabelId { get; init; }
}
