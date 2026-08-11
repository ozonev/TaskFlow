using TaskFlow.Application.Abstractions;

namespace TaskFlow.Application.AuditLogs;

public sealed class GetProjectAuditLogHandler(
    IAuditLogRepository auditLogRepository,
    IProjectRepository projectRepository)
{
    /// <summary>Null means the project does not exist; an empty list means it exists with no audit history.</summary>
    public async Task<IReadOnlyList<AuditLogDto>?> HandleAsync(Guid projectId, CancellationToken cancellationToken)
    {
        if (await projectRepository.GetByIdAsync(projectId, cancellationToken) is null)
        {
            return null;
        }

        var auditLogs = await auditLogRepository.ListByProjectIdAsync(projectId, cancellationToken);

        return [.. auditLogs.Select(AuditLogDto.FromDomain)];
    }
}
