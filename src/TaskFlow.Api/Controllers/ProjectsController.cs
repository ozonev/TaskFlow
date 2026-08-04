using Microsoft.AspNetCore.Mvc;
using TaskFlow.Api.Projects;
using TaskFlow.Application.Projects;

namespace TaskFlow.Api.Controllers;

[ApiController]
[Route("api/projects")]
[Tags("Projects")]
public sealed class ProjectsController(
    CreateProjectHandler createHandler,
    GetProjectByIdHandler getByIdHandler,
    ILogger<ProjectsController> logger) : ControllerBase
{
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

        var response = new ProjectResponse(
            project.Id,
            project.Name,
            project.Description,
            project.CreatedAtUtc);

        return CreatedAtAction(nameof(GetByIdAsync), new { id = project.Id }, response);
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

        return Ok(new ProjectResponse(project.Id, project.Name, project.Description, project.CreatedAtUtc));
    }
}
