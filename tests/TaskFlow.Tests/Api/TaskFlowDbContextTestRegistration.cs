using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using TaskFlow.Infrastructure;

namespace TaskFlow.Tests.Api;

internal static class TaskFlowDbContextTestRegistration
{
    /// <summary>Strips Program.cs's own TaskFlowDbContext registration so a fixture can replace it.</summary>
    public static void RemoveDefaultRegistration(IServiceCollection services)
    {
        services.RemoveAll<IDbContextOptionsConfiguration<TaskFlowDbContext>>();
        services.RemoveAll<DbContextOptions<TaskFlowDbContext>>();
        services.RemoveAll<DbContextOptions>();
        services.RemoveAll<TaskFlowDbContext>();
    }
}
