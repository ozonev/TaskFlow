using TaskFlow.Application.Abstractions;
using TaskFlow.Domain.TaskItems;

namespace TaskFlow.Infrastructure.Persistence.Repositories;

public sealed class TaskRepository(TaskFlowDbContext context) : ITaskRepository
{
    public async Task AddAsync(TaskItem task, CancellationToken cancellationToken)
    {
        context.Tasks.Add(task);

        await context.SaveChangesAsync(cancellationToken);
    }
}
