using TaskFlow.Application.Abstractions;

namespace TaskFlow.Application.Projects;

public sealed class ListProjectsHandler(IProjectRepository repository)
{
    public async Task<ListProjectsResult> HandleAsync(ListProjectsQuery query, CancellationToken cancellationToken)
    {
        var totalCount = await repository.CountAsync(cancellationToken);

        // Computed as long: (Page - 1) * PageSize overflows Int32 for validation-legal but huge
        // Page values, which would wrap negative and make Skip silently clamp back to 0.
        var skip = (long)(query.Page - 1) * query.PageSize;

        IReadOnlyList<ProjectDto> items;
        if (skip >= totalCount)
        {
            items = [];
        }
        else
        {
            var projects = await repository.ListAsync((int)skip, query.PageSize, cancellationToken);
            items = projects
                .Select(project => new ProjectDto(project.Id, project.Name, project.Description, project.CreatedAtUtc))
                .ToArray();
        }

        return new ListProjectsResult(items, query.Page, query.PageSize, totalCount);
    }
}
