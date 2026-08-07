namespace TaskFlow.Application.Comments;

public sealed record CreateCommentCommand(Guid TaskId, string AuthorName, string Text);
