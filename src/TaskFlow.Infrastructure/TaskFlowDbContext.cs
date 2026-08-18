using Microsoft.EntityFrameworkCore;
using TaskFlow.Domain.AuditLogs;
using TaskFlow.Domain.Labels;
using TaskFlow.Domain.Projects;
using TaskFlow.Domain.TaskComments;
using TaskFlow.Domain.TaskItems;

namespace TaskFlow.Infrastructure;

public class TaskFlowDbContext(DbContextOptions<TaskFlowDbContext> options) : DbContext(options)
{
    public DbSet<Project> Projects => Set<Project>();

    public DbSet<TaskItem> Tasks => Set<TaskItem>();

    public DbSet<TaskComment> Comments => Set<TaskComment>();

    public DbSet<AuditLog> AuditLogs => Set<AuditLog>();

    public DbSet<Label> Labels => Set<Label>();

    public DbSet<TaskLabel> TaskLabels => Set<TaskLabel>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(TaskFlowDbContext).Assembly);

        base.OnModelCreating(modelBuilder);
    }

    public override int SaveChanges(bool acceptAllChangesOnSuccess)
    {
        SyncLabelNormalizedNames();
        return base.SaveChanges(acceptAllChangesOnSuccess);
    }

    public override Task<int> SaveChangesAsync(
        bool acceptAllChangesOnSuccess,
        CancellationToken cancellationToken = default)
    {
        SyncLabelNormalizedNames();
        return base.SaveChangesAsync(acceptAllChangesOnSuccess, cancellationToken);
    }

    /// <summary>
    /// Centralized here, not in LabelRepository.AddAsync, so the case-insensitive uniqueness
    /// backstop (see LabelConfiguration's NameNormalized shadow property) holds for every code path
    /// that adds or renames a Label — including tests that seed one directly via context.Labels.Add
    /// — rather than only the one call site that happens to remember to set it.
    /// </summary>
    private void SyncLabelNormalizedNames()
    {
        foreach (var entry in ChangeTracker.Entries<Label>())
        {
            if (entry.State is EntityState.Added or EntityState.Modified)
            {
                entry.Property("NameNormalized").CurrentValue = entry.Entity.Name.ToLower();
            }
        }
    }
}
