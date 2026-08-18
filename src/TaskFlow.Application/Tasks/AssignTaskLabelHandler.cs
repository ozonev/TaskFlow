using TaskFlow.Application.Abstractions;
using TaskFlow.Application.Labels;
using TaskFlow.Domain.AuditLogs;
using TaskFlow.Domain.Labels;

namespace TaskFlow.Application.Tasks;

public sealed class AssignTaskLabelHandler(
    ITaskRepository taskRepository,
    ILabelRepository labelRepository,
    ITaskLabelRepository taskLabelRepository,
    IAuditLogRepository auditLogRepository,
    IUnitOfWork unitOfWork)
{
    public async Task<AssignTaskLabelResult> HandleAsync(
        AssignTaskLabelCommand command,
        CancellationToken cancellationToken)
    {
        var task = await taskRepository.GetByIdAsync(command.TaskId, cancellationToken);
        if (task is null)
        {
            return new AssignTaskLabelResult(AssignTaskLabelOutcome.TaskNotFound, null);
        }

        var label = await labelRepository.GetByIdAsync(command.LabelId, cancellationToken);
        if (label is null)
        {
            return new AssignTaskLabelResult(AssignTaskLabelOutcome.LabelNotFound, null);
        }

        if (label.ProjectId != task.ProjectId)
        {
            return new AssignTaskLabelResult(AssignTaskLabelOutcome.LabelBelongsToDifferentProject, null);
        }

        // Re-assigning an already-assigned label is idempotent rather than an error.
        if (!await taskLabelRepository.ExistsAsync(task.Id, label.Id, cancellationToken))
        {
            try
            {
                await unitOfWork.ExecuteInTransactionAsync(async ct =>
                {
                    await taskLabelRepository.AssignAsync(TaskLabel.Create(task.Id, label.Id), ct);

                    var auditLog = AuditLog.Create(
                        task.ProjectId,
                        task.Id,
                        AuditEventType.TaskLabelAssigned,
                        $"Label '{label.Name}' assigned to task '{task.Title}'.");
                    await auditLogRepository.AddAsync(auditLog, ct);
                }, cancellationToken);
            }
            catch (ConcurrentWriteConflictException)
            {
                // Lost a race with a concurrent identical assignment: the composite-PK conflict
                // means the pair is already there — exactly the idempotent outcome this method
                // promises, not a real failure. Safe to re-query here: ExecuteInTransactionAsync
                // only throws after rolling back and disposing the failed transaction.
                if (!await taskLabelRepository.ExistsAsync(task.Id, label.Id, cancellationToken))
                {
                    throw;
                }
            }
        }

        var labels = await taskLabelRepository.GetForTaskAsync(task.Id, cancellationToken);
        var taskDto = new TaskDto(
            task.Id,
            task.ProjectId,
            task.Title,
            task.Description,
            task.Status,
            task.DueDate,
            task.CreatedAtUtc,
            labels.Select(LabelDto.FromDomain).ToArray());

        return new AssignTaskLabelResult(AssignTaskLabelOutcome.Assigned, taskDto);
    }
}
