using Microsoft.AspNetCore.Mvc;
using TaskFlow.Api.Projects;
using TaskFlow.Application.Projects;

namespace TaskFlow.Api.Controllers;

[ApiController]
[Route("api/projects")]
[Tags("Projects")]
public sealed class ProjectsController(
    CreateProjectHandler handler,
    ILogger<ProjectsController> logger) : ControllerBase
{
    [HttpPost]
    [ProducesResponseType<ProjectResponse>(StatusCodes.Status201Created)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<ProjectResponse>> CreateAsync(
        CreateProjectRequest request,
        CancellationToken cancellationToken)
    {
        var project = await handler.HandleAsync(
            new CreateProjectCommand(request.Name, request.Description),
            cancellationToken);

        logger.LogInformation("Created project {ProjectId}.", project.Id);

        var response = new ProjectResponse(
            project.Id,
            project.Name,
            project.Description,
            project.CreatedAtUtc);

        return Created($"/api/projects/{project.Id}", response);
    }
}
