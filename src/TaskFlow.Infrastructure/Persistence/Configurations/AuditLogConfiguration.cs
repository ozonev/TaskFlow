using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using TaskFlow.Domain.AuditLogs;
using TaskFlow.Domain.Projects;

namespace TaskFlow.Infrastructure.Persistence.Configurations;

internal sealed class AuditLogConfiguration : IEntityTypeConfiguration<AuditLog>
{
    public void Configure(EntityTypeBuilder<AuditLog> builder)
    {
        builder.ToTable("AuditLogs");

        builder.HasKey(auditLog => auditLog.Id);

        builder.Property(auditLog => auditLog.Id)
            .ValueGeneratedNever();

        builder.Property(auditLog => auditLog.Description)
            .IsRequired()
            .HasMaxLength(AuditLog.DescriptionMaxLength);

        // No FK to TaskItem (deliberately — see ProjectId's comment below for the analogous
        // ProjectId call), but GetTaskAuditLogHandler's primary query filters by TaskId, so it
        // still needs an index to avoid a full table scan.
        builder.HasIndex(auditLog => auditLog.TaskId);

        // Optional FK (ProjectId is nullable) defaults to Restrict, unlike the required FKs on
        // TaskItem/TaskComment, which cascade automatically — set explicitly so deleting a project
        // doesn't leave its ExecuteDeleteAsync callers (see tests) tripping a FK violation on
        // orphaned audit rows.
        builder.HasOne<Project>()
            .WithMany()
            .HasForeignKey(auditLog => auditLog.ProjectId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.Property(auditLog => auditLog.CreatedAtUtc)
            .IsRequired()
            .HasUtcConversion();
    }
}
