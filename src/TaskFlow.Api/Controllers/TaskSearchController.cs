using Microsoft.AspNetCore.Mvc;
using TaskFlow.Api.Tasks;
using TaskFlow.Application.Abstractions;
using TaskFlow.Application.Tasks;

namespace TaskFlow.Api.Controllers;

[ApiController]
[Route("api/tasks")]
[Tags("Tasks")]
public sealed class TaskSearchController(
    SearchTasksHandler searchHandler,
    GetTaskByIdHandler getByIdHandler) : ControllerBase
{
    [HttpGet("search")]
    [ProducesResponseType<TaskSearchResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<TaskSearchResponse>> SearchAsync(
        [FromQuery] SearchTasksRequest request,
        CancellationToken cancellationToken)
    {
        var filter = new TaskSearchFilter(
            request.ProjectId,
            request.Status,
            request.DueDateFrom,
            request.DueDateTo,
            request.Title);

        var result = await searchHandler.HandleAsync(
            new SearchTasksQuery(filter, request.Page, request.PageSize),
            cancellationToken);

        return Ok(TaskSearchResponse.FromResult(result));
    }

    [HttpGet("{id:guid}")]
    [ActionName(nameof(GetByIdAsync))]
    [ProducesResponseType<TaskResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<TaskResponse>> GetByIdAsync(Guid id, CancellationToken cancellationToken)
    {
        var task = await getByIdHandler.HandleAsync(id, cancellationToken);

        if (task is null)
        {
            return NotFound();
        }

        return Ok(TaskResponse.FromDto(task));
    }
}
