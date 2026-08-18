namespace TaskFlow.Application.Labels;

public enum CreateLabelOutcome
{
    Created,
    ProjectNotFound,
    DuplicateName,
}

public sealed record CreateLabelResult(CreateLabelOutcome Outcome, LabelDto? Label);
