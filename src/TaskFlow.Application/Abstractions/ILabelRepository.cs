using TaskFlow.Domain.Labels;

namespace TaskFlow.Application.Abstractions;

public interface ILabelRepository
{
    /// <summary>Adds <b>and</b> saves — there is no separate unit of work.</summary>
    Task AddAsync(Label label, CancellationToken cancellationToken);

    Task<Label?> GetByIdAsync(Guid id, CancellationToken cancellationToken);

    /// <summary>Case-insensitive, scoped to the project — the pre-check backing CreateLabelHandler's duplicate-name rejection.</summary>
    Task<bool> ExistsByNameAsync(Guid projectId, string name, CancellationToken cancellationToken);

    Task<IReadOnlyList<Label>> ListByProjectIdAsync(Guid projectId, CancellationToken cancellationToken);
}
