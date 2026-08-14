using TaskFlow.Application.Tasks;

namespace TaskFlow.Api.Tasks;

public sealed record TaskSearchResponse(
    IReadOnlyList<TaskResponse> Items,
    int Page,
    int PageSize,
    int TotalCount,
    int TotalPages)
{
    public static TaskSearchResponse FromResult(SearchTasksResult result) => new(
        result.Items.Select(TaskResponse.FromDto).ToArray(),
        result.Page,
        result.PageSize,
        result.TotalCount,
        result.TotalPages);
}
