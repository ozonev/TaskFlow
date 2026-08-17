resource "azurerm_user_assigned_identity" "this" {
  name                = "id-taskflow-preview"
  resource_group_name = azurerm_resource_group.this.name
  location            = azurerm_resource_group.this.location
  tags                = local.common_tags
}

# Minimum image-pull permission, scoped to the registry only -- not Owner/Contributor, not
# resource-group or subscription scope. The only role assignment in either Terraform root.
resource "azurerm_role_assignment" "acr_pull" {
  scope                = azurerm_container_registry.this.id
  role_definition_name = "AcrPull"
  principal_id         = azurerm_user_assigned_identity.this.principal_id
}
