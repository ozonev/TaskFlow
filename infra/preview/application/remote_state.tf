# Reads platform's local state directly rather than a name-based data lookup, because the storage
# account and ACR names both carry a random suffix generated inside platform that application has
# no way to derive on its own. See docs/architecture/preview-environment.md and the plan that
# implemented this split for the full rationale.
data "terraform_remote_state" "platform" {
  backend = "local"

  config = {
    path = "${path.module}/../platform/terraform.tfstate"
  }
}
