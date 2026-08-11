using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using TaskFlow.Domain.Projects;

namespace TaskFlow.Infrastructure.Persistence.Configurations;

internal sealed class ProjectConfiguration : IEntityTypeConfiguration<Project>
{
    public void Configure(EntityTypeBuilder<Project> builder)
    {
        builder.ToTable("Projects");

        builder.HasKey(project => project.Id);

        builder.Property(project => project.Id)
            .ValueGeneratedNever();

        builder.Property(project => project.Name)
            .IsRequired()
            .HasMaxLength(Project.NameMaxLength);

        builder.Property(project => project.Description)
            .HasMaxLength(Project.DescriptionMaxLength);

        builder.Property(project => project.CreatedAtUtc)
            .IsRequired()
            .HasUtcConversion();
    }
}
