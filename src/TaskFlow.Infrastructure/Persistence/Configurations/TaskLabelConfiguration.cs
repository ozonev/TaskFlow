using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using TaskFlow.Domain.Labels;
using TaskFlow.Domain.TaskItems;

namespace TaskFlow.Infrastructure.Persistence.Configurations;

internal sealed class TaskLabelConfiguration : IEntityTypeConfiguration<TaskLabel>
{
    public void Configure(EntityTypeBuilder<TaskLabel> builder)
    {
        builder.ToTable("TaskLabels");

        builder.HasKey(taskLabel => new { taskLabel.TaskId, taskLabel.LabelId });

        builder.HasOne<TaskItem>()
            .WithMany()
            .HasForeignKey(taskLabel => taskLabel.TaskId)
            .IsRequired();

        builder.HasOne<Label>()
            .WithMany()
            .HasForeignKey(taskLabel => taskLabel.LabelId)
            .IsRequired();

        builder.Property(taskLabel => taskLabel.CreatedAtUtc)
            .IsRequired()
            .HasUtcConversion();

        // Covers the label-filter join's LabelId equality lookup (TaskRepository.ApplyFilter).
        builder.HasIndex(taskLabel => taskLabel.LabelId);
    }
}
