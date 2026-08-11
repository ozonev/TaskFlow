using TaskFlow.Domain.TaskItems;

namespace TaskFlow.Application.Tasks;

public sealed record TaskDto(
    Guid Id,
    Guid ProjectId,
    string Title,
    string? Description,
    TaskItemStatus Status,
    DateTime? DueDate,
    DateTime CreatedAtUtc);
