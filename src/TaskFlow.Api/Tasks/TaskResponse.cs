using System.Text.Json.Serialization;
using TaskFlow.Application.Tasks;
using TaskFlow.Domain.TaskItems;

namespace TaskFlow.Api.Tasks;

public sealed record TaskResponse(
    Guid Id,
    Guid ProjectId,
    string Title,
    string? Description,
    [property: JsonConverter(typeof(JsonStringEnumConverter))] TaskItemStatus Status,
    DateTime? DueDate,
    DateTime CreatedAtUtc)
{
    public static TaskResponse FromDto(TaskDto task) => new(
        task.Id,
        task.ProjectId,
        task.Title,
        task.Description,
        task.Status,
        task.DueDate,
        task.CreatedAtUtc);
}
