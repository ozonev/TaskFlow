using TaskFlow.Application.Abstractions;

namespace TaskFlow.Application.Projects;

public sealed class UpdateProjectHandler(IProjectRepository repository)
{
    public async Task<ProjectDto?> HandleAsync(UpdateProjectCommand command, CancellationToken cancellationToken)
    {
        var project = await repository.GetTrackedByIdAsync(command.Id, cancellationToken);

        if (project is null)
        {
            return null;
        }

        project.Update(command.Name, command.Description);

        await repository.SaveChangesAsync(cancellationToken);

        return new ProjectDto(project.Id, project.Name, project.Description, project.CreatedAtUtc);
    }
}
