using Microsoft.EntityFrameworkCore;

namespace TaskFlow.Infrastructure;

public class TaskFlowDbContext(DbContextOptions<TaskFlowDbContext> options) : DbContext(options)
{
}
