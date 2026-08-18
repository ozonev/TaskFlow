using Microsoft.AspNetCore.Mvc;
using TaskFlow.Api.Labels;
using TaskFlow.Application.Labels;

namespace TaskFlow.Api.Controllers;

[ApiController]
[Route("api/projects/{projectId:guid}/labels")]
[Tags("Labels")]
public sealed class LabelsController(
    CreateLabelHandler createHandler,
    ListLabelsHandler listHandler,
    ILogger<LabelsController> logger) : ControllerBase
{
    [HttpPost]
    [ProducesResponseType<LabelResponse>(StatusCodes.Status201Created)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<LabelResponse>> CreateAsync(
        Guid projectId,
        CreateLabelRequest request,
        CancellationToken cancellationToken)
    {
        var result = await createHandler.HandleAsync(new CreateLabelCommand(projectId, request.Name), cancellationToken);

        switch (result.Outcome)
        {
            case CreateLabelOutcome.ProjectNotFound:
                return NotFound();
            case CreateLabelOutcome.DuplicateName:
                ModelState.AddModelError(
                    nameof(request.Name), $"A label named '{request.Name}' already exists in this project.");
                return ValidationProblem(ModelState);
            default:
                var response = LabelResponse.FromDto(result.Label!);
                logger.LogInformation("Created label {LabelId} for project {ProjectId}.", response.Id, projectId);
                return Created($"/api/projects/{projectId}/labels/{response.Id}", response);
        }
    }

    [HttpGet]
    [ProducesResponseType<IReadOnlyList<LabelResponse>>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<IReadOnlyList<LabelResponse>>> ListAsync(
        Guid projectId,
        CancellationToken cancellationToken)
    {
        var labels = await listHandler.HandleAsync(projectId, cancellationToken);

        if (labels is null)
        {
            return NotFound();
        }

        return Ok(labels.Select(LabelResponse.FromDto).ToArray());
    }
}
