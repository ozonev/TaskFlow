using TaskFlow.Application.Abstractions;

namespace TaskFlow.Application.Labels;

public sealed class ListLabelsHandler(ILabelRepository labelRepository, IProjectRepository projectRepository)
{
    /// <summary>Null means the project does not exist; an empty list means it exists with no labels.</summary>
    public async Task<IReadOnlyList<LabelDto>?> HandleAsync(Guid projectId, CancellationToken cancellationToken)
    {
        if (await projectRepository.GetByIdAsync(projectId, cancellationToken) is null)
        {
            return null;
        }

        var labels = await labelRepository.ListByProjectIdAsync(projectId, cancellationToken);

        return labels.Select(label => new LabelDto(label.Id, label.ProjectId, label.Name, label.CreatedAtUtc)).ToArray();
    }
}
