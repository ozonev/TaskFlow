using TaskFlow.Domain.TaskComments;

namespace TaskFlow.Tests.Domain;

public sealed class TaskCommentTests
{
    private static readonly Guid TaskId = Guid.CreateVersion7();

    [Fact]
    public void Create_TrimsAuthorNameAndText()
    {
        var comment = TaskComment.Create(TaskId, "  Ada  ", "  Looks good to me  ");

        Assert.Equal("Ada", comment.AuthorName);
        Assert.Equal("Looks good to me", comment.Text);
    }

    [Fact]
    public void Create_GeneratesIdAndUtcTimestamp()
    {
        var before = DateTime.UtcNow;

        var comment = TaskComment.Create(TaskId, "Ada", "Looks good to me");

        Assert.NotEqual(Guid.Empty, comment.Id);
        Assert.Equal(TaskId, comment.TaskId);
        Assert.Equal(DateTimeKind.Utc, comment.CreatedAtUtc.Kind);
        Assert.InRange(comment.CreatedAtUtc, before, DateTime.UtcNow);
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public void Create_WithBlankAuthorName_Throws(string authorName)
    {
        Assert.Throws<ArgumentException>(() => TaskComment.Create(TaskId, authorName, "Looks good to me"));
    }

    [Fact]
    public void Create_WithNullAuthorName_Throws()
    {
        Assert.Throws<ArgumentNullException>(() => TaskComment.Create(TaskId, null!, "Looks good to me"));
    }

    [Fact]
    public void Create_WithAuthorNameOverMaxLength_Throws()
    {
        Assert.Throws<ArgumentException>(
            () => TaskComment.Create(TaskId, new string('a', TaskComment.AuthorNameMaxLength + 1), "Text"));
    }

    [Fact]
    public void Create_WithAuthorNameAtMaxLength_Succeeds()
    {
        var authorName = new string('a', TaskComment.AuthorNameMaxLength);

        var comment = TaskComment.Create(TaskId, authorName, "Text");

        Assert.Equal(authorName, comment.AuthorName);
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public void Create_WithBlankText_Throws(string text)
    {
        Assert.Throws<ArgumentException>(() => TaskComment.Create(TaskId, "Ada", text));
    }

    [Fact]
    public void Create_WithNullText_Throws()
    {
        Assert.Throws<ArgumentNullException>(() => TaskComment.Create(TaskId, "Ada", null!));
    }

    [Fact]
    public void Create_WithTextOverMaxLength_Throws()
    {
        Assert.Throws<ArgumentException>(
            () => TaskComment.Create(TaskId, "Ada", new string('a', TaskComment.TextMaxLength + 1)));
    }

    [Fact]
    public void Create_WithTextAtMaxLength_Succeeds()
    {
        var text = new string('a', TaskComment.TextMaxLength);

        var comment = TaskComment.Create(TaskId, "Ada", text);

        Assert.Equal(text, comment.Text);
    }

    /// <summary>Pins the trim-then-measure order: padding must not push a legal value over the limit.</summary>
    [Fact]
    public void Create_WithWhitespacePaddedTextAtMaxLength_Succeeds()
    {
        var text = new string('a', TaskComment.TextMaxLength);

        var comment = TaskComment.Create(TaskId, "Ada", $"  {text}  ");

        Assert.Equal(text, comment.Text);
    }
}
