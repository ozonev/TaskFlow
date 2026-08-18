using System.Text.Json.Serialization;
using TaskFlow.Api.Labels;
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
    DateTime CreatedAtUtc,
    LabelResponse[] Labels)
{
    public static TaskResponse FromDto(TaskDto task) => new(
        task.Id,
        task.ProjectId,
        task.Title,
        task.Description,
        task.Status,
        task.DueDate,
        task.CreatedAtUtc,
        task.Labels.Select(LabelResponse.FromDto).ToArray());
}
