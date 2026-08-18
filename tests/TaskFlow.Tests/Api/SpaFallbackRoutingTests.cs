using System.Net;

namespace TaskFlow.Tests.Api;

public sealed class SpaFallbackRoutingTests(TaskFlowApiFactory factory) : IClassFixture<TaskFlowApiFactory>
{
    private readonly HttpClient _client = factory.CreateClient();

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Fact]
    public async Task Get_UnmatchedApiRoute_Returns404NotSpaFallback()
    {
        var response = await _client.GetAsync("/api/this-route-does-not-exist", Ct);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }
}
