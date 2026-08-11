namespace TaskFlow.Api.Comments;

public sealed record CommentResponse(Guid Id, Guid TaskId, string AuthorName, string Text, DateTime CreatedAtUtc);
