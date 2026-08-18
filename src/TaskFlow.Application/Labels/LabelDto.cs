using TaskFlow.Domain.Labels;

namespace TaskFlow.Application.Labels;

public sealed record LabelDto(Guid Id, Guid ProjectId, string Name, DateTime CreatedAtUtc)
{
    public static LabelDto FromDomain(Label label) => new(label.Id, label.ProjectId, label.Name, label.CreatedAtUtc);
}
