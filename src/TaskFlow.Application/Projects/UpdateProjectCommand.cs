namespace TaskFlow.Application.Projects;

public sealed record UpdateProjectCommand(Guid Id, string? Name, string? Description);
