using TaskFlow.Application.Abstractions;
using TaskFlow.Domain.AuditLogs;
using TaskFlow.Domain.Labels;

namespace TaskFlow.Application.Labels;

public sealed class CreateLabelHandler(
    ILabelRepository labelRepository,
    IProjectRepository projectRepository,
    IAuditLogRepository auditLogRepository,
    IUnitOfWork unitOfWork)
{
    public async Task<CreateLabelResult> HandleAsync(CreateLabelCommand command, CancellationToken cancellationToken)
    {
        if (await projectRepository.GetByIdAsync(command.ProjectId, cancellationToken) is null)
        {
            return new CreateLabelResult(CreateLabelOutcome.ProjectNotFound, null);
        }

        if (await labelRepository.ExistsByNameAsync(command.ProjectId, command.Name, cancellationToken))
        {
            return new CreateLabelResult(CreateLabelOutcome.DuplicateName, null);
        }

        var label = Label.Create(command.ProjectId, command.Name);

        try
        {
            await unitOfWork.ExecuteInTransactionAsync(async ct =>
            {
                await labelRepository.AddAsync(label, ct);

                var auditLog = AuditLog.Create(
                    label.ProjectId,
                    null,
                    AuditEventType.LabelCreated,
                    $"Label '{label.Name}' created.");
                await auditLogRepository.AddAsync(auditLog, ct);
            }, cancellationToken);
        }
        catch (ConcurrentWriteConflictException)
        {
            // Lost a race with a concurrent identical-name create: the (ProjectId, Name) unique
            // index backstop (see LabelConfiguration) means the name is now taken, which is exactly
            // the DuplicateName outcome this handler already has a contract for — not a real failure.
            // Any other cause of the conflict re-throws, since the name would then still be free.
            // Safe to re-query here: ExecuteInTransactionAsync only throws after rolling back and
            // disposing the failed transaction, so this runs against a clean one.
            if (!await labelRepository.ExistsByNameAsync(command.ProjectId, command.Name, cancellationToken))
            {
                throw;
            }

            return new CreateLabelResult(CreateLabelOutcome.DuplicateName, null);
        }

        return new CreateLabelResult(CreateLabelOutcome.Created, LabelDto.FromDomain(label));
    }
}
