using System.Text.Json.Serialization;
using TaskFlow.Domain.TaskItems;

namespace TaskFlow.Api.Tasks;

public sealed record TaskResponse(
    Guid Id,
    Guid ProjectId,
    string Title,
    string? Description,
    [property: JsonConverter(typeof(JsonStringEnumConverter))] TaskItemStatus Status,
    DateTime? DueDate,
    DateTime CreatedAtUtc);
