namespace TaskFlow.Application.Tasks;

public sealed record ListProjectTasksQuery(Guid ProjectId, int Page, int PageSize);
