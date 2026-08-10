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

    [Fact]
    public void Update_TrimsNameAndDescription()
    {
        var project = Project.Create("Apollo", "First slice");

        project.Update("  Gemini  ", "  Second slice  ");

        Assert.Equal("Gemini", project.Name);
        Assert.Equal("Second slice", project.Description);
    }

    [Fact]
    public void Update_WithNullName_LeavesNameUnchanged()
    {
        var project = Project.Create("Apollo", "First slice");

        project.Update(null, "Second slice");

        Assert.Equal("Apollo", project.Name);
        Assert.Equal("Second slice", project.Description);
    }

    [Fact]
    public void Update_WithNullDescription_LeavesDescriptionUnchanged()
    {
        var project = Project.Create("Apollo", "First slice");

        project.Update("Gemini", null);

        Assert.Equal("Gemini", project.Name);
        Assert.Equal("First slice", project.Description);
    }

    [Fact]
    public void Update_WithBothNull_LeavesProjectUnchanged()
    {
        var project = Project.Create("Apollo", "First slice");

        project.Update(null, null);

        Assert.Equal("Apollo", project.Name);
        Assert.Equal("First slice", project.Description);
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public void Update_WithBlankDescription_ClearsToNull(string description)
    {
        var project = Project.Create("Apollo", "First slice");

        project.Update(null, description);

        Assert.Null(project.Description);
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public void Update_WithBlankName_Throws(string name)
    {
        var project = Project.Create("Apollo", "First slice");

        Assert.Throws<ArgumentException>(() => project.Update(name, null));
    }

    [Fact]
    public void Update_WithNameOverMaxLength_Throws()
    {
        var project = Project.Create("Apollo", "First slice");

        Assert.Throws<ArgumentException>(() => project.Update(new string('a', Project.NameMaxLength + 1), null));
    }

    [Fact]
    public void Update_WithDescriptionOverMaxLength_Throws()
    {
        var project = Project.Create("Apollo", "First slice");

        Assert.Throws<ArgumentException>(
            () => project.Update(null, new string('a', Project.DescriptionMaxLength + 1)));
    }

    [Fact]
    public void Update_WithValidNameAndInvalidDescription_DoesNotChangeName()
    {
        var project = Project.Create("Apollo", "First slice");

        Assert.Throws<ArgumentException>(
            () => project.Update("Gemini", new string('a', Project.DescriptionMaxLength + 1)));

        Assert.Equal("Apollo", project.Name);
        Assert.Equal("First slice", project.Description);
    }
}
