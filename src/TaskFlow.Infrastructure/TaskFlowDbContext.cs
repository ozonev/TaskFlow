using Microsoft.EntityFrameworkCore;
using TaskFlow.Domain.AuditLogs;
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

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(TaskFlowDbContext).Assembly);

        base.OnModelCreating(modelBuilder);
    }
}
