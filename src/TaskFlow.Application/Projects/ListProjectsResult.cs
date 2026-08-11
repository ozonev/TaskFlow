namespace TaskFlow.Application.Projects;

public sealed record ListProjectsResult(IReadOnlyList<ProjectDto> Items, int Page, int PageSize, int TotalCount)
{
    public int TotalPages => (int)Math.Ceiling(TotalCount / (double)PageSize);
}
