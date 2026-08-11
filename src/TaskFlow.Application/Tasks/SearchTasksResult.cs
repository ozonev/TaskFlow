namespace TaskFlow.Application.Tasks;

public sealed record SearchTasksResult(IReadOnlyList<TaskDto> Items, int Page, int PageSize, int TotalCount)
{
    public int TotalPages => (int)Math.Ceiling(TotalCount / (double)PageSize);
}
