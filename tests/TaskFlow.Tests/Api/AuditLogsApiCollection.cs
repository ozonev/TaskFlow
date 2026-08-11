namespace TaskFlow.Tests.Api;

[CollectionDefinition(Name)]
public sealed class AuditLogsApiCollection : ICollectionFixture<TaskFlowApiFactory>
{
    public const string Name = "Audit Logs API";
}
