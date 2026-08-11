using Microsoft.AspNetCore.Mvc;
using TaskFlow.Api.AuditLogs;
using TaskFlow.Api.Projects;
using TaskFlow.Application.AuditLogs;
using TaskFlow.Application.Projects;

namespace TaskFlow.Api.Controllers;

[ApiController]
[Route("api/projects")]
[Tags("Projects")]
public sealed class ProjectsController(
    CreateProjectHandler createHandler,
    GetProjectByIdHandler getByIdHandler,
    UpdateProjectHandler updateHandler,
    ListProjectsHandler listHandler,
    GetProjectAuditLogHandler getAuditLogHandler,
    ILogger<ProjectsController> logger) : ControllerBase
{
    [HttpGet]
    [ProducesResponseType<ProjectListResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<ProjectListResponse>> ListAsync(
        [FromQuery] ListProjectsRequest request,
        CancellationToken cancellationToken)
    {
        var result = await listHandler.HandleAsync(
            new ListProjectsQuery(request.Page, request.PageSize),
            cancellationToken);

        return Ok(ToListResponse(result));
    }

    [HttpPost]
    [ProducesResponseType<ProjectResponse>(StatusCodes.Status201Created)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<ProjectResponse>> CreateAsync(
        CreateProjectRequest request,
        CancellationToken cancellationToken)
    {
        var project = await createHandler.HandleAsync(
            new CreateProjectCommand(request.Name, request.Description),
            cancellationToken);

        logger.LogInformation("Created project {ProjectId}.", project.Id);

        return CreatedAtAction(nameof(GetByIdAsync), new { id = project.Id }, ToResponse(project));
    }

    [HttpGet("{id:guid}")]
    [ActionName(nameof(GetByIdAsync))]
    [ProducesResponseType<ProjectResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<ProjectResponse>> GetByIdAsync(Guid id, CancellationToken cancellationToken)
    {
        var project = await getByIdHandler.HandleAsync(id, cancellationToken);

        if (project is null)
        {
            return NotFound();
        }

        return Ok(ToResponse(project));
    }

    [HttpPatch("{id:guid}")]
    [ProducesResponseType<ProjectResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<ProjectResponse>> UpdateAsync(
        Guid id,
        UpdateProjectRequest request,
        CancellationToken cancellationToken)
    {
        var project = await updateHandler.HandleAsync(
            new UpdateProjectCommand(id, request.Name, request.Description),
            cancellationToken);

        if (project is null)
        {
            return NotFound();
        }

        logger.LogInformation("Updated project {ProjectId}.", project.Id);

        return Ok(ToResponse(project));
    }

    [HttpGet("{id:guid}/audit")]
    [ProducesResponseType<IReadOnlyList<AuditLogResponse>>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<IReadOnlyList<AuditLogResponse>>> GetAuditAsync(
        Guid id,
        CancellationToken cancellationToken)
    {
        var auditLogs = await getAuditLogHandler.HandleAsync(id, cancellationToken);

        if (auditLogs is null)
        {
            return NotFound();
        }

        return Ok(auditLogs.Select(AuditLogResponse.FromDto).ToArray());
    }

    private static ProjectResponse ToResponse(ProjectDto project) => new(
        project.Id,
        project.Name,
        project.Description,
        project.CreatedAtUtc);

    private static ProjectListResponse ToListResponse(ListProjectsResult result) => new(
        result.Items.Select(ToResponse).ToArray(),
        result.Page,
        result.PageSize,
        result.TotalCount,
        result.TotalPages);
}
