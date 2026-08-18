locals {
  common_tags = data.terraform_remote_state.platform.outputs.common_tags

  # Npgsql keyword-value connection string, assembled from platform's Postgres outputs. Carries a
  # real credential (unlike the SQLite path this replaced), so it's wired via a Container Apps
  # secret rather than a plain env var -- see the `secret` block and `secret_name` env entry in main.tf.
  postgres_connection_string = "Host=${data.terraform_remote_state.platform.outputs.postgres_fqdn};Port=5432;Database=${data.terraform_remote_state.platform.outputs.postgres_database_name};Username=${data.terraform_remote_state.platform.outputs.postgres_admin_login};Password=${data.terraform_remote_state.platform.outputs.postgres_admin_password}"

  # docs/architecture/preview-environment.md §5/§6.
  env_vars = {
    DatabaseProvider       = "Postgres"
    ASPNETCORE_ENVIRONMENT = "Production"
    # Preview-only escape hatch -- NOT the production migration strategy. Safe only because this
    # Container App is hard-pinned to min_replicas = max_replicas = 1 (no concurrent-migration race).
    TASKFLOW_APPLY_MIGRATIONS = "true"
  }
}
