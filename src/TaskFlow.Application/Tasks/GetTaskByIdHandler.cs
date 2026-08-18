using TaskFlow.Application.Abstractions;
using TaskFlow.Application.Labels;

namespace TaskFlow.Application.Tasks;

public sealed class GetTaskByIdHandler(ITaskRepository repository, ITaskLabelRepository taskLabelRepository)
{
    public async Task<TaskDto?> HandleAsync(Guid id, CancellationToken cancellationToken)
    {
        var task = await repository.GetByIdAsync(id, cancellationToken);
        if (task is null)
        {
            return null;
        }

        var labels = await taskLabelRepository.GetForTaskAsync(task.Id, cancellationToken);

        return new TaskDto(
            task.Id,
            task.ProjectId,
            task.Title,
            task.Description,
            task.Status,
            task.DueDate,
            task.CreatedAtUtc,
            labels.Select(LabelDto.FromDomain).ToArray());
    }
}
