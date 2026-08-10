namespace TaskFlow.Api.Tasks;

public sealed record TaskSearchResponse(
    IReadOnlyList<TaskResponse> Items,
    int Page,
    int PageSize,
    int TotalCount,
    int TotalPages);
