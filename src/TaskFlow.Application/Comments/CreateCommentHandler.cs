using TaskFlow.Application.Abstractions;
using TaskFlow.Domain.TaskComments;

namespace TaskFlow.Application.Comments;

public sealed class CreateCommentHandler(ICommentRepository commentRepository, ITaskRepository taskRepository)
{
    public async Task<CommentDto?> HandleAsync(CreateCommentCommand command, CancellationToken cancellationToken)
    {
        if (!await taskRepository.ExistsAsync(command.TaskId, cancellationToken))
        {
            return null;
        }

        var comment = TaskComment.Create(command.TaskId, command.AuthorName, command.Text);

        await commentRepository.AddAsync(comment, cancellationToken);

        return new CommentDto(comment.Id, comment.TaskId, comment.AuthorName, comment.Text, comment.CreatedAtUtc);
    }
}
