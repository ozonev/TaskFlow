namespace TaskFlow.Application.Labels;

public sealed record CreateLabelCommand(Guid ProjectId, string Name);
