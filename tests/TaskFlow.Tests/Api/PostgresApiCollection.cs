namespace TaskFlow.Tests.Api;

[CollectionDefinition(Name)]
public sealed class PostgresApiCollection : ICollectionFixture<TaskFlowPostgresApiFactory>
{
    public const string Name = "Postgres API";
}
