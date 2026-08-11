namespace TaskFlow.Api.Projects;

public sealed record ProjectListResponse(
    IReadOnlyList<ProjectResponse> Items,
    int Page,
    int PageSize,
    int TotalCount,
    int TotalPages);
