using TaskFlow.Application.Abstractions;

namespace TaskFlow.Application.Tasks;

public sealed class GetTaskByIdHandler(ITaskRepository repository)
{
    public async Task<TaskDto?> HandleAsync(Guid id, CancellationToken cancellationToken)
    {
        var task = await repository.GetByIdAsync(id, cancellationToken);

        return task is null
            ? null
            : new TaskDto(task.Id, task.ProjectId, task.Title, task.Description, task.Status, task.DueDate, task.CreatedAtUtc);
    }
}
