output "resource_group_name" {
  value = azurerm_resource_group.this.name
}

output "location" {
  value = azurerm_resource_group.this.location
}

output "container_apps_environment_id" {
  value = azurerm_container_app_environment.this.id
}

output "container_apps_environment_storage_name" {
  value = azurerm_container_app_environment_storage.this.name
}

output "storage_account_name" {
  value = azurerm_storage_account.this.name
}

output "storage_account_id" {
  value = azurerm_storage_account.this.id
}

output "file_share_name" {
  value = azurerm_storage_share.this.name
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
