using TaskFlow.Domain.AuditLogs;

namespace TaskFlow.Tests.Domain;

public sealed class AuditLogTests
{
    private static readonly Guid ProjectId = Guid.CreateVersion7();
    private static readonly Guid TaskId = Guid.CreateVersion7();

    [Fact]
    public void Create_GeneratesIdAndUtcTimestamp()
    {
        var before = DateTime.UtcNow;

        var auditLog = AuditLog.Create(ProjectId, TaskId, AuditEventType.TaskCreated, "Task 'Ship it' created.");

        Assert.NotEqual(Guid.Empty, auditLog.Id);
        Assert.Equal(ProjectId, auditLog.ProjectId);
        Assert.Equal(TaskId, auditLog.TaskId);
        Assert.Equal(AuditEventType.TaskCreated, auditLog.EventType);
        Assert.Equal(DateTimeKind.Utc, auditLog.CreatedAtUtc.Kind);
        Assert.InRange(auditLog.CreatedAtUtc, before, DateTime.UtcNow);
    }

    [Fact]
    public void Create_WithNullProjectId_Succeeds()
    {
        var auditLog = AuditLog.Create(null, TaskId, AuditEventType.TaskCommentAdded, "Comment added by 'Ada'.");

        Assert.Null(auditLog.ProjectId);
        Assert.Equal(TaskId, auditLog.TaskId);
    }

    [Fact]
    public void Create_WithNullTaskId_Succeeds()
    {
        var auditLog = AuditLog.Create(ProjectId, null, AuditEventType.ProjectCreated, "Project 'Alpha' created.");

        Assert.Equal(ProjectId, auditLog.ProjectId);
        Assert.Null(auditLog.TaskId);
    }

    [Fact]
    public void Create_TrimsDescription()
    {
        var auditLog = AuditLog.Create(ProjectId, TaskId, AuditEventType.TaskCreated, "  Task created.  ");

        Assert.Equal("Task created.", auditLog.Description);
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public void Create_WithBlankDescription_Throws(string description)
    {
        Assert.Throws<ArgumentException>(
            () => AuditLog.Create(ProjectId, TaskId, AuditEventType.TaskCreated, description));
    }

    [Fact]
    public void Create_WithNullDescription_Throws()
    {
        Assert.Throws<ArgumentNullException>(
            () => AuditLog.Create(ProjectId, TaskId, AuditEventType.TaskCreated, null!));
    }

    [Fact]
    public void Create_WithDescriptionOverMaxLength_Throws()
    {
        Assert.Throws<ArgumentException>(
            () => AuditLog.Create(
                ProjectId,
                TaskId,
                AuditEventType.TaskCreated,
                new string('a', AuditLog.DescriptionMaxLength + 1)));
    }

    [Fact]
    public void Create_WithDescriptionAtMaxLength_Succeeds()
    {
        var description = new string('a', AuditLog.DescriptionMaxLength);

        var auditLog = AuditLog.Create(ProjectId, TaskId, AuditEventType.TaskCreated, description);

        Assert.Equal(description, auditLog.Description);
    }
}
