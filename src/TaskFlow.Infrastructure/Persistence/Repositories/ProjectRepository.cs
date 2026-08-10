using Microsoft.EntityFrameworkCore;
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

    public async Task<Project?> GetByIdAsync(Guid id, CancellationToken cancellationToken) =>
        await context.Projects.AsNoTracking().SingleOrDefaultAsync(project => project.Id == id, cancellationToken);

    public async Task<Project?> GetTrackedByIdAsync(Guid id, CancellationToken cancellationToken) =>
        await context.Projects.SingleOrDefaultAsync(project => project.Id == id, cancellationToken);

    public async Task SaveChangesAsync(CancellationToken cancellationToken) =>
        await context.SaveChangesAsync(cancellationToken);

    public async Task<IReadOnlyList<Project>> ListAsync(int skip, int take, CancellationToken cancellationToken) =>
        await context.Projects.AsNoTracking()
            .OrderBy(project => project.CreatedAtUtc)
            .ThenBy(project => project.Id)
            .Skip(skip)
            .Take(take)
            .ToListAsync(cancellationToken);

    public async Task<int> CountAsync(CancellationToken cancellationToken) =>
        await context.Projects.CountAsync(cancellationToken);
}
