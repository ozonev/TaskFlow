namespace TaskFlow.Tests.Api;

[CollectionDefinition(Name)]
public sealed class LabelsApiCollection : ICollectionFixture<TaskFlowApiFactory>
{
    public const string Name = "Labels API";
}
