using TaskFlow.Application.Abstractions;

namespace TaskFlow.Application.Comments;

public sealed class GetCommentsByTaskIdHandler(
    ICommentRepository commentRepository,
    ITaskRepository taskRepository)
{
    /// <summary>Null means the task does not exist; an empty list means it exists with no comments.</summary>
    public async Task<IReadOnlyList<CommentDto>?> HandleAsync(Guid taskId, CancellationToken cancellationToken)
    {
        if (!await taskRepository.ExistsAsync(taskId, cancellationToken))
        {
            return null;
        }

        var comments = await commentRepository.GetByTaskIdAsync(taskId, cancellationToken);

        return [.. comments.Select(comment => new CommentDto(
            comment.Id,
            comment.TaskId,
            comment.AuthorName,
            comment.Text,
            comment.CreatedAtUtc))];
    }
}
