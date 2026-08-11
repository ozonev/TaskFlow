namespace TaskFlow.Api.Projects;

public sealed record ProjectResponse(Guid Id, string Name, string? Description, DateTime CreatedAtUtc);
