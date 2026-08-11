using TaskFlow.Application.Abstractions;

namespace TaskFlow.Application.Tasks;

public sealed class SearchTasksHandler(ITaskRepository repository)
{
    public async Task<SearchTasksResult> HandleAsync(SearchTasksQuery query, CancellationToken cancellationToken)
    {
        var totalCount = await repository.CountAsync(query.Filter, cancellationToken);

        var skip = (long)(query.Page) * query.PageSize;

        IReadOnlyList<TaskDto> items;
        if (skip >= totalCount)
        {
            items = [];
        }
        else
        {
            var tasks = await repository.SearchAsync(query.Filter, (int)skip, query.PageSize, cancellationToken);
            items = tasks
                .Select(task => new TaskDto(
                    task.Id,
                    task.ProjectId,
                    task.Title,
                    task.Description,
                    task.Status,
                    task.DueDate,
                    task.CreatedAtUtc))
                .ToArray();
        }

        return new SearchTasksResult(items, query.Page, query.PageSize, totalCount);
    }
}
