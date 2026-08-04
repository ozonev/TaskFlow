namespace TaskFlow.Tests.Api;

[CollectionDefinition(Name)]
public sealed class ProjectsApiCollection : ICollectionFixture<TaskFlowApiFactory>
{
    public const string Name = "Projects API";
}
