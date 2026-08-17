locals {
  common_tags = data.terraform_remote_state.platform.outputs.common_tags

  # docs/architecture/preview-environment.md §5/§6.
  env_vars = {
    ConnectionStrings__DefaultConnection = "Data Source=/data/taskflow.db"
    DatabaseProvider                     = "Sqlite"
    ASPNETCORE_ENVIRONMENT               = "Production"
    # Preview-only escape hatch -- NOT the production migration strategy. Safe only because this
    # Container App is hard-pinned to min_replicas = max_replicas = 1 (no concurrent-migration race).
    TASKFLOW_APPLY_MIGRATIONS = "true"
  }
}
