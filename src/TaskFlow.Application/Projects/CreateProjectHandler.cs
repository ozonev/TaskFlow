using TaskFlow.Application.Abstractions;
using TaskFlow.Domain.Projects;

namespace TaskFlow.Application.Projects;

public sealed class CreateProjectHandler(IProjectRepository repository)
{
    public async Task<ProjectDto> HandleAsync(CreateProjectCommand command, CancellationToken cancellationToken)
    {
        var project = Project.Create(command.Name, command.Description);

        await repository.AddAsync(project, cancellationToken);

        return new ProjectDto(project.Id, project.Name, project.Description, project.CreatedAtUtc);
    }
}
