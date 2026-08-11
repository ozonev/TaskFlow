namespace TaskFlow.Tests.Api;

[CollectionDefinition(Name)]
public sealed class TasksApiCollection : ICollectionFixture<TaskFlowApiFactory>
{
    public const string Name = "Tasks API";
}
