using Microsoft.EntityFrameworkCore;
using TaskFlow.Application.Abstractions;
using TaskFlow.Domain.Labels;

namespace TaskFlow.Infrastructure.Persistence.Repositories;

public sealed class TaskLabelRepository(TaskFlowDbContext context) : ITaskLabelRepository
{
    public async Task AssignAsync(TaskLabel taskLabel, CancellationToken cancellationToken)
    {
        context.TaskLabels.Add(taskLabel);

        await context.SaveChangesAsync(cancellationToken);
    }

    public async Task<bool> ExistsAsync(Guid taskId, Guid labelId, CancellationToken cancellationToken) =>
        await context.TaskLabels.AnyAsync(
            taskLabel => taskLabel.TaskId == taskId && taskLabel.LabelId == labelId, cancellationToken);

    public async Task<IReadOnlyList<Label>> GetForTaskAsync(Guid taskId, CancellationToken cancellationToken) =>
        await context.TaskLabels
            .AsNoTracking()
            .Where(taskLabel => taskLabel.TaskId == taskId)
            .Join(context.Labels, taskLabel => taskLabel.LabelId, label => label.Id, (_, label) => label)
            .OrderBy(label => label.CreatedAtUtc)
            .ThenBy(label => label.Id)
            .ToListAsync(cancellationToken);

    public async Task<ILookup<Guid, Label>> GetForTasksAsync(
        IReadOnlyCollection<Guid> taskIds,
        CancellationToken cancellationToken)
    {
        if (taskIds.Count == 0)
        {
            return Enumerable.Empty<(Guid, Label)>().ToLookup(pair => pair.Item1, pair => pair.Item2);
        }

        var pairs = await context.TaskLabels
            .AsNoTracking()
            .Where(taskLabel => taskIds.Contains(taskLabel.TaskId))
            .Join(context.Labels, taskLabel => taskLabel.LabelId, label => label.Id,
                (taskLabel, label) => new { taskLabel.TaskId, Label = label })
            .ToListAsync(cancellationToken);

        return pairs.ToLookup(pair => pair.TaskId, pair => pair.Label);
    }
}
