using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using TaskFlow.Domain.Labels;
using TaskFlow.Domain.Projects;

namespace TaskFlow.Infrastructure.Persistence.Configurations;

internal sealed class LabelConfiguration : IEntityTypeConfiguration<Label>
{
    public void Configure(EntityTypeBuilder<Label> builder)
    {
        builder.ToTable("Labels");

        builder.HasKey(label => label.Id);

        builder.Property(label => label.Id)
            .ValueGeneratedNever();

        builder.Property(label => label.Name)
            .IsRequired()
            .HasMaxLength(Label.NameMaxLength);

        builder.HasOne<Project>()
            .WithMany()
            .HasForeignKey(label => label.ProjectId)
            .IsRequired();

        builder.Property(label => label.CreatedAtUtc)
            .IsRequired()
            .HasUtcConversion();

        // Backstop against the ExistsByNameAsync pre-check's TOCTOU race (see CreateLabelHandler).
        // Exact-case unique, matching the pre-check's own .ToLower() comparison technique rather
        // than a provider-specific case-insensitive collation.
        builder.HasIndex(label => new { label.ProjectId, label.Name }).IsUnique();
    }
}
