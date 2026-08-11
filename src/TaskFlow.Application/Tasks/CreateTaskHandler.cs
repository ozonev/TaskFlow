using TaskFlow.Application.Abstractions;
using TaskFlow.Domain.TaskItems;

namespace TaskFlow.Application.Tasks;

public sealed class CreateTaskHandler(ITaskRepository taskRepository, IProjectRepository projectRepository)
{
    public async Task<TaskDto?> HandleAsync(CreateTaskCommand command, CancellationToken cancellationToken)
    {
        var project = await projectRepository.GetByIdAsync(command.ProjectId, cancellationToken);
        if (project is null)
        {
            return null;
        }

        var task = TaskItem.Create(command.ProjectId, command.Title, command.Description, command.DueDate);

        await taskRepository.AddAsync(task, cancellationToken);

        return new TaskDto(task.Id, task.ProjectId, task.Title, task.Description, task.Status, task.DueDate, task.CreatedAtUtc);
    }
}
