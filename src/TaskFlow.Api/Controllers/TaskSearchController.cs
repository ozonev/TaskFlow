using Microsoft.AspNetCore.Mvc;
using TaskFlow.Api.Tasks;
using TaskFlow.Application.Abstractions;
using TaskFlow.Application.Tasks;

namespace TaskFlow.Api.Controllers;

[ApiController]
[Route("api/tasks")]
[Tags("Tasks")]
public sealed class TaskSearchController(SearchTasksHandler searchHandler) : ControllerBase
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

        return Ok(ToResponse(result));
    }

    private static TaskSearchResponse ToResponse(SearchTasksResult result) => new(
        result.Items.Select(ToResponse).ToArray(),
        result.Page,
        result.PageSize,
        result.TotalCount,
        result.TotalPages);

    private static TaskResponse ToResponse(TaskDto task) => new(
        task.Id,
        task.ProjectId,
        task.Title,
        task.Description,
        task.Status,
        task.DueDate,
        task.CreatedAtUtc);
}
