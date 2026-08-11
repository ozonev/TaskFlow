namespace TaskFlow.Infrastructure.Migrations.Postgres;

// Reads the actual built assembly name via typeof(), so Program.cs and the Postgres test fixture
// can't drift from it with a hardcoded string a project rename would silently leave stale.
public static class PostgresMigrationsAssembly
{
    public static readonly string Name = typeof(PostgresMigrationsAssembly).Assembly.GetName().Name!;
}
