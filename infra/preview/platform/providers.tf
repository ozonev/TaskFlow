# Hardcoded literal, not a variable, so it can't be overridden via -var (see docs/architecture/preview-guardrails.md).
provider "azurerm" {
  subscription_id = "ad925f8c-465f-45b4-9632-f6286e0f30e4"
  tenant_id       = "a0c01160-86c9-4406-8a44-392e8b9c6d9b"

  features {}
}
