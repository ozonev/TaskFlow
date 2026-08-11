namespace TaskFlow.Application.Comments;

public sealed record CommentDto(Guid Id, Guid TaskId, string AuthorName, string Text, DateTime CreatedAtUtc);
