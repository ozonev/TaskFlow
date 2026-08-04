using TaskFlow.Domain.Projects;

namespace TaskFlow.Application.Abstractions;

public interface IProjectRepository
{
    /// <summary>Adds <b>and</b> saves — there is no separate unit of work.</summary>
    Task AddAsync(Project project, CancellationToken cancellationToken);

    Task<Project?> GetByIdAsync(Guid id, CancellationToken cancellationToken);
}
