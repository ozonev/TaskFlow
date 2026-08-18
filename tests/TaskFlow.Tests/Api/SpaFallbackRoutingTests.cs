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

    /// <summary>
    /// The positive case (an unmatched non-API route serving wwwroot/index.html with 200) isn't
    /// exercised here because the test host has no wwwroot -- the frontend is only built into
    /// that directory by the Dockerfile, not by `dotnet test`. Confirmed manually against the
    /// deployed container instead. This test documents the test host's actual behavior in that
    /// gap (falls through to a plain 404, the same as any other route MapControllers doesn't
    /// claim) rather than leaving the case silently untested.
    /// </summary>
    [Fact]
    public async Task Get_UnmatchedNonApiRoute_Returns404InTestHostWithoutWwwroot()
    {
        var response = await _client.GetAsync("/some-frontend-route", Ct);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }
}
