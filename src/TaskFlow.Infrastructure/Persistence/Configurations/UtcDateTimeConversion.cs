using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace TaskFlow.Infrastructure.Persistence.Configurations;

/// <summary>
/// SQLite stores DateTime as TEXT with no offset, so it reads back as Unspecified without this.
/// Npgsql already returns Utc for timestamptz, so the same conversion is a harmless no-op there
/// rather than needing a provider branch.
/// </summary>
internal static class UtcDateTimeConversion
{
    public static PropertyBuilder<DateTime> HasUtcConversion(this PropertyBuilder<DateTime> builder) =>
        builder.HasConversion(
            utc => utc,
            stored => DateTime.SpecifyKind(stored, DateTimeKind.Utc));

    public static PropertyBuilder<DateTime?> HasUtcConversion(this PropertyBuilder<DateTime?> builder) =>
        builder.HasConversion(
            utc => utc,
            stored => stored.HasValue ? DateTime.SpecifyKind(stored.Value, DateTimeKind.Utc) : stored);
}
