using Microsoft.EntityFrameworkCore;
using TaskFlow.Domain.Projects;
using TaskFlow.Domain.TaskItems;

namespace TaskFlow.Infrastructure;

public class TaskFlowDbContext(DbContextOptions<TaskFlowDbContext> options) : DbContext(options)
{
    public DbSet<Project> Projects => Set<Project>();

    public DbSet<TaskItem> Tasks => Set<TaskItem>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(TaskFlowDbContext).Assembly);

        base.OnModelCreating(modelBuilder);
    }
}
