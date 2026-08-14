using TaskFlow.Application.Abstractions;

namespace TaskFlow.Application.Tasks;

public sealed class ListProjectTasksHandler(SearchTasksHandler searchHandler, IProjectRepository projectRepository)
{
    /// <summary>Null means the project does not exist; an empty page means it exists with no tasks.</summary>
    public async Task<SearchTasksResult?> HandleAsync(ListProjectTasksQuery query, CancellationToken cancellationToken)
    {
        if (await projectRepository.GetByIdAsync(query.ProjectId, cancellationToken) is null)
        {
            return null;
        }

        var filter = new TaskSearchFilter(query.ProjectId, null, null, null, null);
        return await searchHandler.HandleAsync(new SearchTasksQuery(filter, query.Page, query.PageSize), cancellationToken);
    }
}
