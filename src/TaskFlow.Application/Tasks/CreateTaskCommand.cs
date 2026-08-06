namespace TaskFlow.Application.Tasks;

public sealed record CreateTaskCommand(Guid ProjectId, string Title, string? Description, DateTime? DueDate);
