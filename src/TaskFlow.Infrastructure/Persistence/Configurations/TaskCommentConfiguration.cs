using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using TaskFlow.Domain.TaskComments;
using TaskFlow.Domain.TaskItems;

namespace TaskFlow.Infrastructure.Persistence.Configurations;

internal sealed class TaskCommentConfiguration : IEntityTypeConfiguration<TaskComment>
{
    public void Configure(EntityTypeBuilder<TaskComment> builder)
    {
        builder.ToTable("Comments");

        builder.HasKey(comment => comment.Id);

        builder.Property(comment => comment.Id)
            .ValueGeneratedNever();

        builder.Property(comment => comment.AuthorName)
            .IsRequired()
            .HasMaxLength(TaskComment.AuthorNameMaxLength);

        builder.Property(comment => comment.Text)
            .IsRequired()
            .HasMaxLength(TaskComment.TextMaxLength);

        builder.HasOne<TaskItem>()
            .WithMany()
            .HasForeignKey(comment => comment.TaskId)
            .IsRequired();

        builder.Property(comment => comment.CreatedAtUtc)
            .IsRequired()
            .HasUtcConversion();
    }
}
