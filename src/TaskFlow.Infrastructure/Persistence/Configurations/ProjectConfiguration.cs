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

        // Shared across providers: SQLite stores DateTime as TEXT with no offset, so it reads
        // back as Unspecified without this. Npgsql already returns Utc for timestamptz, so the
        // same conversion is a harmless no-op there rather than needing a provider branch.
        builder.Property(project => project.CreatedAtUtc)
            .IsRequired()
            .HasConversion(
                utc => utc,
                stored => DateTime.SpecifyKind(stored, DateTimeKind.Utc));
    }
}
