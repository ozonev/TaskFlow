using TaskFlow.Domain.TaskItems;

namespace TaskFlow.Tests.Domain;

public sealed class TaskItemTests
{
    private static readonly Guid ProjectId = Guid.CreateVersion7();

    [Fact]
    public void Create_TrimsTitleAndDescription()
    {
        var task = TaskItem.Create(ProjectId, "  Apollo  ", "  A description  ", null);

        Assert.Equal("Apollo", task.Title);
        Assert.Equal("A description", task.Description);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void Create_WithBlankDescription_StoresNull(string? description)
    {
        var task = TaskItem.Create(ProjectId, "Apollo", description, null);

        Assert.Null(task.Description);
    }

    [Fact]
    public void Create_GeneratesIdAndUtcTimestampAndTodoStatus()
    {
        var before = DateTime.UtcNow;

        var task = TaskItem.Create(ProjectId, "Apollo", null, null);

        Assert.NotEqual(Guid.Empty, task.Id);
        Assert.Equal(ProjectId, task.ProjectId);
        Assert.Equal(TaskItemStatus.Todo, task.Status);
        Assert.Equal(DateTimeKind.Utc, task.CreatedAtUtc.Kind);
        Assert.InRange(task.CreatedAtUtc, before, DateTime.UtcNow);
    }

    [Fact]
    public void Create_WithDueDate_StoresIt()
    {
        var dueDate = new DateTime(2026, 12, 1, 0, 0, 0, DateTimeKind.Utc);

        var task = TaskItem.Create(ProjectId, "Apollo", null, dueDate);

        Assert.Equal(dueDate, task.DueDate);
    }

    [Fact]
    public void Create_WithUnspecifiedKindDueDate_LabelsItUtcWithoutConverting()
    {
        var dueDate = new DateTime(2026, 12, 1, 0, 0, 0, DateTimeKind.Unspecified);

        var task = TaskItem.Create(ProjectId, "Apollo", null, dueDate);

        Assert.Equal(DateTimeKind.Utc, task.DueDate!.Value.Kind);
        Assert.Equal(dueDate.Ticks, task.DueDate.Value.Ticks);
    }

    [Fact]
    public void Create_WithLocalKindDueDate_ConvertsToUtc()
    {
        var dueDate = new DateTime(2026, 12, 1, 0, 0, 0, DateTimeKind.Local);

        var task = TaskItem.Create(ProjectId, "Apollo", null, dueDate);

        Assert.Equal(DateTimeKind.Utc, task.DueDate!.Value.Kind);
        Assert.Equal(dueDate.ToUniversalTime(), task.DueDate);
    }

    [Fact]
    public void Create_WithoutDueDate_StoresNull()
    {
        var task = TaskItem.Create(ProjectId, "Apollo", null, null);

        Assert.Null(task.DueDate);
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public void Create_WithBlankTitle_Throws(string title)
    {
        Assert.Throws<ArgumentException>(() => TaskItem.Create(ProjectId, title, null, null));
    }

    [Fact]
    public void Create_WithNullTitle_Throws()
    {
        Assert.Throws<ArgumentNullException>(() => TaskItem.Create(ProjectId, null!, null, null));
    }

    [Fact]
    public void Create_WithTitleOverMaxLength_Throws()
    {
        Assert.Throws<ArgumentException>(
            () => TaskItem.Create(ProjectId, new string('a', TaskItem.TitleMaxLength + 1), null, null));
    }

    [Fact]
    public void Create_WithDescriptionOverMaxLength_Throws()
    {
        Assert.Throws<ArgumentException>(
            () => TaskItem.Create(ProjectId, "Apollo", new string('a', TaskItem.DescriptionMaxLength + 1), null));
    }
}
