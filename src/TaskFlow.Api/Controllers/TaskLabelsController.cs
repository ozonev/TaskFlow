using Microsoft.AspNetCore.Mvc;
using TaskFlow.Api.Tasks;
using TaskFlow.Application.Tasks;

namespace TaskFlow.Api.Controllers;

[ApiController]
[Route("api/tasks/{taskId:guid}/labels")]
[Tags("Tasks")]
public sealed class TaskLabelsController(AssignTaskLabelHandler assignHandler, ILogger<TaskLabelsController> logger)
    : ControllerBase
{
    [HttpPost]
    [ProducesResponseType<TaskResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<TaskResponse>> AssignAsync(
        Guid taskId,
        AssignTaskLabelRequest request,
        CancellationToken cancellationToken)
    {
        var result = await assignHandler.HandleAsync(
            // [ApiController] already rejects a missing LabelId with 400 before this action runs
            // (see AssignTaskLabelRequest), so LabelId is guaranteed non-null here.
            new AssignTaskLabelCommand(taskId, request.LabelId!.Value), cancellationToken);

        switch (result.Outcome)
        {
            case AssignTaskLabelOutcome.TaskNotFound:
            case AssignTaskLabelOutcome.LabelNotFound:
                return NotFound();
            case AssignTaskLabelOutcome.LabelBelongsToDifferentProject:
                ModelState.AddModelError(
                    nameof(request.LabelId), "Label does not belong to this task's project.");
                return ValidationProblem(ModelState);
            default:
                logger.LogInformation("Assigned label {LabelId} to task {TaskId}.", request.LabelId, taskId);
                return Ok(TaskResponse.FromDto(result.Task!));
        }
    }
}
