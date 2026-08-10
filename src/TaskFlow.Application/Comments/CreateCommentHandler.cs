using TaskFlow.Application.Abstractions;
using TaskFlow.Domain.AuditLogs;
using TaskFlow.Domain.TaskComments;

namespace TaskFlow.Application.Comments;

public sealed class CreateCommentHandler(
    ICommentRepository commentRepository,
    ITaskRepository taskRepository,
    IAuditLogRepository auditLogRepository,
    IUnitOfWork unitOfWork)
{
    public async Task<CommentDto?> HandleAsync(CreateCommentCommand command, CancellationToken cancellationToken)
    {
        if (!await taskRepository.ExistsAsync(command.TaskId, cancellationToken))
        {
            return null;
        }

        var comment = TaskComment.Create(command.TaskId, command.AuthorName, command.Text);

        await unitOfWork.ExecuteInTransactionAsync(async ct =>
        {
            await commentRepository.AddAsync(comment, ct);

            var auditLog = AuditLog.Create(
                null,
                comment.TaskId,
                AuditEventType.TaskCommentAdded,
                $"Comment added to task by '{comment.AuthorName}'.");
            await auditLogRepository.AddAsync(auditLog, ct);
        }, cancellationToken);

        return new CommentDto(comment.Id, comment.TaskId, comment.AuthorName, comment.Text, comment.CreatedAtUtc);
    }
}
