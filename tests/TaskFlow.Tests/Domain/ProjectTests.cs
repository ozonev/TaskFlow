using TaskFlow.Domain.Projects;

namespace TaskFlow.Tests.Domain;

public sealed class ProjectTests
{
    [Fact]
    public void Create_TrimsNameAndDescription()
    {
        var project = Project.Create("  Apollo  ", "  A description  ");

        Assert.Equal("Apollo", project.Name);
        Assert.Equal("A description", project.Description);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void Create_WithBlankDescription_StoresNull(string? description)
    {
        var project = Project.Create("Apollo", description);

        Assert.Null(project.Description);
    }

    [Fact]
    public void Create_GeneratesIdAndUtcTimestamp()
    {
        var before = DateTime.UtcNow;

        var project = Project.Create("Apollo", null);

        Assert.NotEqual(Guid.Empty, project.Id);
        Assert.Equal(DateTimeKind.Utc, project.CreatedAtUtc.Kind);
        Assert.InRange(project.CreatedAtUtc, before, DateTime.UtcNow);
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public void Create_WithBlankName_Throws(string name)
    {
        Assert.Throws<ArgumentException>(() => Project.Create(name, null));
    }

    [Fact]
    public void Create_WithNullName_Throws()
    {
        Assert.Throws<ArgumentNullException>(() => Project.Create(null!, null));
    }

    [Fact]
    public void Create_WithNameOverMaxLength_Throws()
    {
        Assert.Throws<ArgumentException>(() => Project.Create(new string('a', Project.NameMaxLength + 1), null));
    }

    [Fact]
    public void Create_WithDescriptionOverMaxLength_Throws()
    {
        Assert.Throws<ArgumentException>(
            () => Project.Create("Apollo", new string('a', Project.DescriptionMaxLength + 1)));
    }
}
