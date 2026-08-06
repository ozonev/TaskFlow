using Microsoft.AspNetCore.Mvc;
using TaskFlow.Api.Tasks;
using TaskFlow.Application.Tasks;

namespace TaskFlow.Api.Controllers;

[ApiController]
[Route("api/projects/{projectId:guid}/tasks")]
[Tags("Tasks")]
public sealed class TasksController(
    CreateTaskHandler createHandler,
    ILogger<TasksController> logger) : ControllerBase
{
    [HttpPost]
    [ProducesResponseType<TaskResponse>(StatusCodes.Status201Created)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<TaskResponse>> CreateAsync(
        Guid projectId,
        CreateTaskRequest request,
        CancellationToken cancellationToken)
    {
        var task = await createHandler.HandleAsync(
            new CreateTaskCommand(projectId, request.Title, request.Description, request.DueDate),
            cancellationToken);

        if (task is null)
        {
            return NotFound();
        }

        logger.LogInformation("Created task {TaskId} for project {ProjectId}.", task.Id, task.ProjectId);

        var response = new TaskResponse(
            task.Id,
            task.ProjectId,
            task.Title,
            task.Description,
            task.Status,
            task.DueDate,
            task.CreatedAtUtc);

        return Created($"/api/projects/{task.ProjectId}/tasks/{task.Id}", response);
    }
}
