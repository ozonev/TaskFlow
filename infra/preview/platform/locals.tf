locals {
  # docs/architecture/preview-environment.md §7 -- mandatory tags on every preview resource.
  common_tags = {
    environment   = "preview"
    project       = "taskflow"
    owner         = "vitalii.ilchenko@nixs.com"
    "expiry-date" = "2026-08-28"
    "managed-by"  = "terraform"
  }

  # Internal name used by the Container Apps Environment's storage definition, distinct from the
  # Azure File share's own name (fs-taskflow-data). Declared once here, reused in main.tf and outputs.tf.
  container_env_storage_name = "taskflow-data"
}
