using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using TaskFlow.Domain.Projects;
using TaskFlow.Domain.TaskItems;

namespace TaskFlow.Infrastructure.Persistence.Configurations;

internal sealed class TaskItemConfiguration : IEntityTypeConfiguration<TaskItem>
{
    public void Configure(EntityTypeBuilder<TaskItem> builder)
    {
        builder.ToTable("Tasks");

        builder.HasKey(task => task.Id);

        builder.Property(task => task.Id)
            .ValueGeneratedNever();

        builder.Property(task => task.Title)
            .IsRequired()
            .HasMaxLength(TaskItem.TitleMaxLength);

        builder.Property(task => task.Description)
            .HasMaxLength(TaskItem.DescriptionMaxLength);

        builder.HasOne<Project>()
            .WithMany()
            .HasForeignKey(task => task.ProjectId)
            .IsRequired();

        builder.Property(task => task.CreatedAtUtc)
            .IsRequired()
            .HasUtcConversion();

        builder.Property(task => task.DueDate)
            .HasUtcConversion();
    }
}
