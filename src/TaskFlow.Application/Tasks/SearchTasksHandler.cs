using TaskFlow.Application.Abstractions;

namespace TaskFlow.Application.Tasks;

public sealed class SearchTasksHandler(ITaskRepository repository)
{
    public async Task<SearchTasksResult> HandleAsync(SearchTasksQuery query, CancellationToken cancellationToken)
    {
        var totalCount = await repository.CountAsync(query.Filter, cancellationToken);

        // Computed as long: (Page - 1) * PageSize overflows Int32 for validation-legal but huge
        // Page values, which would wrap negative and make Skip silently clamp back to 0.
        var skip = (long)(query.Page - 1) * query.PageSize;

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
