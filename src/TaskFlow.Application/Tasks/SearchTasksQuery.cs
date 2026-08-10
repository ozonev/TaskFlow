using TaskFlow.Application.Abstractions;

namespace TaskFlow.Application.Tasks;

public sealed record SearchTasksQuery(TaskSearchFilter Filter, int Page, int PageSize);
