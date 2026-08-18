# Alphanumeric-only avoids needing to escape special characters inside the Npgsql
# keyword-value connection string assembled in infra/preview/application.
resource "random_password" "postgres_admin" {
  length  = 24
  special = false
}

resource "azurerm_postgresql_flexible_server" "this" {
  name                = "psql-taskflow-preview-${random_string.suffix.result}"
  resource_group_name = azurerm_resource_group.this.name
  location            = azurerm_resource_group.this.location
  version             = "16"

  administrator_login    = "taskflowadmin"
  administrator_password = random_password.postgres_admin.result

  sku_name = "B_Standard_B1ms"
  # 32 GiB is Flexible Server's platform-enforced storage floor regardless of SKU --
  # not a sizing decision, real usage needs far less.
  storage_mb = 32768

  backup_retention_days        = 7
  geo_redundant_backup_enabled = false

  public_network_access_enabled = true

  tags = local.common_tags

  # Azure auto-assigns an availability zone at creation; this config never pins one, and the
  # provider rejects zone changes unless paired with a high_availability standby zone swap --
  # ignore drift here rather than fight Azure's placement decision.
  lifecycle {
    ignore_changes = [zone]
  }
}

resource "azurerm_postgresql_flexible_server_database" "this" {
  name      = "taskflow"
  server_id = azurerm_postgresql_flexible_server.this.id
  collation = "en_US.utf8"
  charset   = "UTF8"
}

# No VNet integration exists for the Container Apps Environment, so public access with
# Azure's documented "allow Azure services" convention (0.0.0.0/0.0.0.0) is used instead --
# the real access gate is the random 24-char admin password, not network isolation.
resource "azurerm_postgresql_flexible_server_firewall_rule" "allow_azure_services" {
  name             = "AllowAllAzureServicesAndResourcesWithinAzureIps"
  server_id        = azurerm_postgresql_flexible_server.this.id
  start_ip_address = "0.0.0.0"
  end_ip_address   = "0.0.0.0"
}
