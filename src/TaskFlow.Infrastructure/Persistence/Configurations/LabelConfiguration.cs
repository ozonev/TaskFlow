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
        // A plain unique index on Name would be exact-case, which is strictly weaker than the
        // pre-check's case-insensitive comparison: two concurrent creates for "Urgent" and "urgent"
        // would both pass the pre-check AND both satisfy an exact-case index, defeating the backstop
        // entirely. NameNormalized (kept in sync for every Added/Modified Label by
        // TaskFlowDbContext.SyncLabelNormalizedNames, not by this repository/handler layer, so it
        // can't be forgotten by a new call site) is a shadow property precisely so the index
        // enforces the same case-insensitive invariant the pre-check does, without a
        // provider-specific collation/extension (SQLite NOCASE vs Postgres citext/ICU) —
        // LabelRepository.ExistsByNameAsync's own .ToLower() query already made that same
        // "don't rely on provider collation" call.
        builder.Property<string>("NameNormalized")
            .IsRequired()
            .HasMaxLength(Label.NameMaxLength);

        builder.HasIndex("ProjectId", "NameNormalized").IsUnique();
    }
}
