using TaskFlow.Application.Abstractions;

namespace TaskFlow.Application.Projects;

public sealed class GetProjectByIdHandler(IProjectRepository repository)
{
    public async Task<ProjectDto?> HandleAsync(Guid id, CancellationToken cancellationToken)
    {
        var project = await repository.GetByIdAsync(id, cancellationToken);

        return project is null
            ? null
            : new ProjectDto(project.Id, project.Name, project.Description, project.CreatedAtUtc);
    }
}
