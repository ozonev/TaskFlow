resource "azurerm_container_app" "this" {
  name                         = var.container_app_name
  resource_group_name          = data.terraform_remote_state.platform.outputs.resource_group_name
  container_app_environment_id = data.terraform_remote_state.platform.outputs.container_apps_environment_id
  revision_mode                = "Single"
  tags                         = local.common_tags

  identity {
    type         = "UserAssigned"
    identity_ids = [data.terraform_remote_state.platform.outputs.user_assigned_identity_id]
  }

  registry {
    server   = data.terraform_remote_state.platform.outputs.container_registry_login_server
    identity = data.terraform_remote_state.platform.outputs.user_assigned_identity_id
  }

  ingress {
    external_enabled = true
    target_port      = 8080
    transport        = "auto"

    traffic_weight {
      latest_revision = true
      percentage      = 100
    }
  }

  template {
    min_replicas = 1
    max_replicas = 1

    container {
      name   = "taskflow-api"
      image  = var.image_tag
      cpu    = var.cpu
      memory = var.memory

      dynamic "env" {
        for_each = local.env_vars
        content {
          name  = env.key
          value = env.value
        }
      }

      liveness_probe {
        transport = "HTTP"
        path      = "/health"
        port      = 8080
      }

      readiness_probe {
        transport = "HTTP"
        path      = "/health"
        port      = 8080
      }

      # Generous threshold so a preview cold start running TASKFLOW_APPLY_MIGRATIONS doesn't get
      # killed mid-migration by the liveness probe (docs/architecture/preview-environment.md §2).
      startup_probe {
        transport               = "HTTP"
        path                    = "/health"
        port                    = 8080
        interval_seconds        = 5
        failure_count_threshold = 10
      }

      volume_mounts {
        name = "data"
        path = "/data"
      }
    }

    volume {
      name         = "data"
      storage_type = "AzureFile"
      storage_name = data.terraform_remote_state.platform.outputs.container_apps_environment_storage_name
    }
  }
}
