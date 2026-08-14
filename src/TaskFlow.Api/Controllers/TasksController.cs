using Microsoft.AspNetCore.Mvc;
using TaskFlow.Api.Tasks;
using TaskFlow.Application.Tasks;

namespace TaskFlow.Api.Controllers;

[ApiController]
[Route("api/projects/{projectId:guid}/tasks")]
[Tags("Tasks")]
public sealed class TasksController(
    CreateTaskHandler createHandler,
    ListProjectTasksHandler listHandler,
    ILogger<TasksController> logger) : ControllerBase
{
    [HttpGet]
    [ProducesResponseType<TaskSearchResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<TaskSearchResponse>> ListAsync(
        Guid projectId,
        [FromQuery] ListProjectTasksRequest request,
        CancellationToken cancellationToken)
    {
        var result = await listHandler.HandleAsync(
            new ListProjectTasksQuery(projectId, request.Page, request.PageSize),
            cancellationToken);

        return result is null
            ? NotFound()
            : Ok(TaskSearchResponse.FromResult(result));
    }

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

        return CreatedAtAction(
            nameof(TaskSearchController.GetByIdAsync), "TaskSearch", new { id = task.Id }, TaskResponse.FromDto(task));
    }
}
