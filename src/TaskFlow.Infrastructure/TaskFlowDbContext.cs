using Microsoft.EntityFrameworkCore;
using TaskFlow.Domain.Projects;

namespace TaskFlow.Infrastructure;

public class TaskFlowDbContext(DbContextOptions<TaskFlowDbContext> options) : DbContext(options)
{
    public DbSet<Project> Projects => Set<Project>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(TaskFlowDbContext).Assembly);

        base.OnModelCreating(modelBuilder);
    }
}
