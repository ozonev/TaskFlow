using TaskFlow.Application.Abstractions;
using TaskFlow.Domain.Projects;

namespace TaskFlow.Infrastructure.Persistence.Repositories;

public sealed class ProjectRepository(TaskFlowDbContext context) : IProjectRepository
{
    public async Task AddAsync(Project project, CancellationToken cancellationToken)
    {
        context.Projects.Add(project);

        await context.SaveChangesAsync(cancellationToken);
    }
}
