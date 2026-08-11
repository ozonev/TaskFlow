namespace TaskFlow.Tests.Api;

[CollectionDefinition(Name)]
public sealed class CommentsApiCollection : ICollectionFixture<TaskFlowApiFactory>
{
    public const string Name = "Comments API";
}
