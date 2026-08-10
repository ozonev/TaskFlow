using TaskFlow.Domain.Projects;

namespace TaskFlow.Application.Abstractions;

public interface IProjectRepository
{
    /// <summary>Adds <b>and</b> saves — there is no separate unit of work.</summary>
    Task AddAsync(Project project, CancellationToken cancellationToken);

    Task<Project?> GetByIdAsync(Guid id, CancellationToken cancellationToken);

    /// <summary>
    /// Reads with change tracking enabled, unlike <see cref="GetByIdAsync"/> — mutations made to
    /// the returned project are picked up column-by-column by <see cref="SaveChangesAsync"/>,
    /// instead of blindly overwriting every column with in-memory values that may be stale
    /// relative to a concurrent update of a different field.
    /// </summary>
    Task<Project?> GetTrackedByIdAsync(Guid id, CancellationToken cancellationToken);

    /// <summary>
    /// Commits every pending change on the underlying, per-request-scoped context — not just the
    /// project from <see cref="GetTrackedByIdAsync"/>. Safe to call unconditionally: EF Core issues
    /// no SQL if nothing is actually modified.
    /// </summary>
    Task SaveChangesAsync(CancellationToken cancellationToken);
}
