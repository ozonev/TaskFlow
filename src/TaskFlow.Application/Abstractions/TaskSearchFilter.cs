using TaskFlow.Domain.TaskItems;

namespace TaskFlow.Application.Abstractions;

public sealed record TaskSearchFilter(
    Guid? ProjectId,
    TaskItemStatus? Status,
    DateTime? DueDateFrom,
    DateTime? DueDateTo,
    string? Title);
