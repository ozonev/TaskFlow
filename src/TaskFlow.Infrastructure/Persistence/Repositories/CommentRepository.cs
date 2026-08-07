using Microsoft.EntityFrameworkCore;
using TaskFlow.Application.Abstractions;
using TaskFlow.Domain.TaskComments;

namespace TaskFlow.Infrastructure.Persistence.Repositories;

public sealed class CommentRepository(TaskFlowDbContext context) : ICommentRepository
{
    public async Task AddAsync(TaskComment comment, CancellationToken cancellationToken)
    {
        context.Comments.Add(comment);

        await context.SaveChangesAsync(cancellationToken);
    }

    public async Task<IReadOnlyList<TaskComment>> GetByTaskIdAsync(
        Guid taskId,
        CancellationToken cancellationToken) =>
        await context.Comments.AsNoTracking()
            .Where(comment => comment.TaskId == taskId)
            .OrderBy(comment => comment.CreatedAtUtc)
            .ThenBy(comment => comment.Id)
            .ToListAsync(cancellationToken);
}
