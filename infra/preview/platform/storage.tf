resource "azurerm_storage_account" "this" {
  name                     = "sttaskflowpreview${random_string.suffix.result}"
  resource_group_name      = azurerm_resource_group.this.name
  location                 = azurerm_resource_group.this.location
  account_kind             = "StorageV2"
  account_tier             = "Standard"
  account_replication_type = "LRS"
  min_tls_version          = "TLS1_2"
  tags                     = local.common_tags
}

resource "azurerm_storage_share" "this" {
  name               = "fs-taskflow-data"
  storage_account_id = azurerm_storage_account.this.id
  quota              = 5
  access_tier        = "TransactionOptimized"
}

# Lands the storage account's access key in this root's state file in plaintext -- the reason
# platform's local state must never be committed (docs/architecture/preview-environment.md §4/§8).
resource "azurerm_container_app_environment_storage" "this" {
  name                         = local.container_env_storage_name
  container_app_environment_id = azurerm_container_app_environment.this.id
  account_name                 = azurerm_storage_account.this.name
  share_name                   = azurerm_storage_share.this.name
  access_key                   = azurerm_storage_account.this.primary_access_key
  access_mode                  = "ReadWrite"
}
