output "resource_group_name" {
  value = azurerm_resource_group.this.name
}

output "location" {
  value = azurerm_resource_group.this.location
}

output "container_apps_environment_id" {
  value = azurerm_container_app_environment.this.id
}

output "postgres_fqdn" {
  value = azurerm_postgresql_flexible_server.this.fqdn
}

output "postgres_database_name" {
  value = azurerm_postgresql_flexible_server_database.this.name
}

output "postgres_admin_login" {
  value = azurerm_postgresql_flexible_server.this.administrator_login
}

output "postgres_admin_password" {
  value     = random_password.postgres_admin.result
  sensitive = true
}

output "container_registry_id" {
  value = azurerm_container_registry.this.id
}

output "container_registry_login_server" {
  value = azurerm_container_registry.this.login_server
}

output "user_assigned_identity_id" {
  value = azurerm_user_assigned_identity.this.id
}

output "user_assigned_identity_principal_id" {
  value = azurerm_user_assigned_identity.this.principal_id
}

output "user_assigned_identity_client_id" {
  value = azurerm_user_assigned_identity.this.client_id
}

output "common_tags" {
  value = local.common_tags
}
