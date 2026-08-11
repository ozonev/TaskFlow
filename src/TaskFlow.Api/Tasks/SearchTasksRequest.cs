using System.ComponentModel.DataAnnotations;
using TaskFlow.Domain.TaskItems;

namespace TaskFlow.Api.Tasks;

public sealed record SearchTasksRequest
{
    public Guid? ProjectId { get; init; }

    public TaskItemStatus? Status { get; init; }

    public DateTime? DueDateFrom { get; init; }

    public DateTime? DueDateTo { get; init; }

    [MaxLength(TaskItem.TitleMaxLength)]
    public string? Title { get; init; }

    [Range(1, int.MaxValue)]
    public int Page { get; init; } = 1;

    [Range(1, 100)]
    public int PageSize { get; init; } = 20;
}
