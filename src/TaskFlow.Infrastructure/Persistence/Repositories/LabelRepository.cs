using Microsoft.EntityFrameworkCore;
using TaskFlow.Application.Abstractions;
using TaskFlow.Domain.Labels;

namespace TaskFlow.Infrastructure.Persistence.Repositories;

public sealed class LabelRepository(TaskFlowDbContext context) : ILabelRepository
{
    public async Task AddAsync(Label label, CancellationToken cancellationToken)
    {
        context.Labels.Add(label);

        await context.SaveChangesAsync(cancellationToken);
    }

    public async Task<Label?> GetByIdAsync(Guid id, CancellationToken cancellationToken) =>
        await context.Labels.AsNoTracking().FirstOrDefaultAsync(label => label.Id == id, cancellationToken);

    /// <summary>
    /// .ToLower() on both sides, matching TaskRepository's title-search technique, so the check is
    /// case-insensitive identically on SQLite and Postgres instead of behaving differently per provider.
    /// </summary>
    public async Task<bool> ExistsByNameAsync(Guid projectId, string name, CancellationToken cancellationToken)
    {
        var loweredName = name.Trim().ToLower();

        return await context.Labels.AnyAsync(
            label => label.ProjectId == projectId && label.Name.ToLower() == loweredName,
            cancellationToken);
    }

    public async Task<IReadOnlyList<Label>> ListByProjectIdAsync(Guid projectId, CancellationToken cancellationToken) =>
        await context.Labels
            .AsNoTracking()
            .Where(label => label.ProjectId == projectId)
            .OrderBy(label => label.CreatedAtUtc)
            .ThenBy(label => label.Id)
            .ToListAsync(cancellationToken);
}
