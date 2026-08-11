using TaskFlow.Application.Abstractions;
using TaskFlow.Domain.AuditLogs;
using TaskFlow.Domain.Projects;

namespace TaskFlow.Application.Projects;

public sealed class CreateProjectHandler(
    IProjectRepository repository,
    IAuditLogRepository auditLogRepository,
    IUnitOfWork unitOfWork)
{
    public async Task<ProjectDto> HandleAsync(CreateProjectCommand command, CancellationToken cancellationToken)
    {
        var project = Project.Create(command.Name, command.Description);

        await unitOfWork.ExecuteInTransactionAsync(async ct =>
        {
            await repository.AddAsync(project, ct);

            var auditLog = AuditLog.Create(
                project.Id,
                null,
                AuditEventType.ProjectCreated,
                $"Project '{project.Name}' created.");
            await auditLogRepository.AddAsync(auditLog, ct);
        }, cancellationToken);

        return new ProjectDto(project.Id, project.Name, project.Description, project.CreatedAtUtc);
    }
}
