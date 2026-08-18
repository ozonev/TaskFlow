using TaskFlow.Application.Labels;

namespace TaskFlow.Api.Labels;

public sealed record LabelResponse(Guid Id, Guid ProjectId, string Name, DateTime CreatedAtUtc)
{
    public static LabelResponse FromDto(LabelDto label) => new(label.Id, label.ProjectId, label.Name, label.CreatedAtUtc);
}
