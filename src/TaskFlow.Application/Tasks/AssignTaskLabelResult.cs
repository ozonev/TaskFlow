namespace TaskFlow.Application.Tasks;

public enum AssignTaskLabelOutcome
{
    Assigned,
    TaskNotFound,
    LabelNotFound,
    LabelBelongsToDifferentProject,
}

public sealed record AssignTaskLabelResult(AssignTaskLabelOutcome Outcome, TaskDto? Task);
