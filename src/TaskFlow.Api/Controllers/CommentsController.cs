using Microsoft.AspNetCore.Mvc;
using TaskFlow.Api.Comments;
using TaskFlow.Application.Comments;

namespace TaskFlow.Api.Controllers;

[ApiController]
[Route("api/tasks/{taskId:guid}/comments")]
[Tags("Comments")]
public sealed class CommentsController(
    CreateCommentHandler createHandler,
    GetCommentsByTaskIdHandler getByTaskIdHandler,
    ILogger<CommentsController> logger) : ControllerBase
{
    [HttpPost]
    [ProducesResponseType<CommentResponse>(StatusCodes.Status201Created)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<CommentResponse>> CreateAsync(
        Guid taskId,
        CreateCommentRequest request,
        CancellationToken cancellationToken)
    {
        var comment = await createHandler.HandleAsync(
            new CreateCommentCommand(taskId, request.AuthorName, request.Text),
            cancellationToken);

        if (comment is null)
        {
            return NotFound();
        }

        logger.LogInformation("Created comment {CommentId} for task {TaskId}.", comment.Id, comment.TaskId);

        var response = ToResponse(comment);

        return Created($"/api/tasks/{comment.TaskId}/comments/{comment.Id}", response);
    }

    [HttpGet]
    [ProducesResponseType<IReadOnlyList<CommentResponse>>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<IReadOnlyList<CommentResponse>>> GetByTaskIdAsync(
        Guid taskId,
        CancellationToken cancellationToken)
    {
        var comments = await getByTaskIdHandler.HandleAsync(taskId, cancellationToken);

        if (comments is null)
        {
            return NotFound();
        }

        return Ok(comments.Select(ToResponse).ToArray());
    }

    private static CommentResponse ToResponse(CommentDto comment) => new(
        comment.Id,
        comment.TaskId,
        comment.AuthorName,
        comment.Text,
        comment.CreatedAtUtc);
}
