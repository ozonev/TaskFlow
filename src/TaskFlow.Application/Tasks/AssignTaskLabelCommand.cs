namespace TaskFlow.Application.Tasks;

public sealed record AssignTaskLabelCommand(Guid TaskId, Guid LabelId);
