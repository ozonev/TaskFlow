using TaskFlow.Domain.Labels;

namespace TaskFlow.Tests.Domain;

public sealed class LabelTests
{
    [Fact]
    public void Create_TrimsName()
    {
        var label = Label.Create(Guid.CreateVersion7(), "  Urgent  ");

        Assert.Equal("Urgent", label.Name);
    }

    [Fact]
    public void Create_GeneratesIdAndUtcTimestamp()
    {
        var before = DateTime.UtcNow;
        var projectId = Guid.CreateVersion7();

        var label = Label.Create(projectId, "Urgent");

        Assert.NotEqual(Guid.Empty, label.Id);
        Assert.Equal(projectId, label.ProjectId);
        Assert.Equal(DateTimeKind.Utc, label.CreatedAtUtc.Kind);
        Assert.InRange(label.CreatedAtUtc, before, DateTime.UtcNow);
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public void Create_WithBlankName_Throws(string name)
    {
        Assert.Throws<ArgumentException>(() => Label.Create(Guid.CreateVersion7(), name));
    }

    [Fact]
    public void Create_WithNullName_Throws()
    {
        Assert.Throws<ArgumentNullException>(() => Label.Create(Guid.CreateVersion7(), null!));
    }

    [Fact]
    public void Create_WithNameOverMaxLength_Throws()
    {
        Assert.Throws<ArgumentException>(
            () => Label.Create(Guid.CreateVersion7(), new string('a', Label.NameMaxLength + 1)));
    }

    [Fact]
    public void Create_WithNameAtMaxLength_Succeeds()
    {
        var label = Label.Create(Guid.CreateVersion7(), new string('a', Label.NameMaxLength));

        Assert.Equal(Label.NameMaxLength, label.Name.Length);
    }
}
