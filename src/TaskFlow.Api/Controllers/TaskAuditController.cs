using Microsoft.AspNetCore.Mvc;
using TaskFlow.Api.AuditLogs;
using TaskFlow.Application.AuditLogs;

namespace TaskFlow.Api.Controllers;

[ApiController]
[Route("api/tasks/{taskId:guid}/audit")]
[Tags("Audit")]
public sealed class TaskAuditController(GetTaskAuditLogHandler getByTaskIdHandler) : ControllerBase
{
    [HttpGet]
    [ProducesResponseType<IReadOnlyList<AuditLogResponse>>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<IReadOnlyList<AuditLogResponse>>> GetByTaskIdAsync(
        Guid taskId,
        CancellationToken cancellationToken)
    {
        var auditLogs = await getByTaskIdHandler.HandleAsync(taskId, cancellationToken);

        if (auditLogs is null)
        {
            return NotFound();
        }

        return Ok(auditLogs.Select(AuditLogResponse.FromDto).ToArray());
    }
}
