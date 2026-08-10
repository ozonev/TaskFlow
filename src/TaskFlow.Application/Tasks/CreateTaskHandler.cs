using TaskFlow.Application.Abstractions;
using TaskFlow.Domain.AuditLogs;
using TaskFlow.Domain.TaskItems;

namespace TaskFlow.Application.Tasks;

public sealed class CreateTaskHandler(
    ITaskRepository taskRepository,
    IProjectRepository projectRepository,
    IAuditLogRepository auditLogRepository,
    IUnitOfWork unitOfWork)
{
    public async Task<TaskDto?> HandleAsync(CreateTaskCommand command, CancellationToken cancellationToken)
    {
        var project = await projectRepository.GetByIdAsync(command.ProjectId, cancellationToken);
        if (project is null)
        {
            return null;
        }

        var task = TaskItem.Create(command.ProjectId, command.Title, command.Description, command.DueDate);

        await unitOfWork.ExecuteInTransactionAsync(async ct =>
        {
            await taskRepository.AddAsync(task, ct);

            var auditLog = AuditLog.Create(
                task.ProjectId,
                task.Id,
                AuditEventType.TaskCreated,
                $"Task '{task.Title}' created.");
            await auditLogRepository.AddAsync(auditLog, ct);
        }, cancellationToken);

        return new TaskDto(task.Id, task.ProjectId, task.Title, task.Description, task.Status, task.DueDate, task.CreatedAtUtc);
    }
}
