locals {
  # docs/architecture/preview-environment.md §7 -- mandatory tags on every preview resource.
  common_tags = {
    environment   = "preview"
    project       = "taskflow"
    owner         = "vitalii.ilchenko@nixs.com"
    "expiry-date" = "2026-08-28"
    "managed-by"  = "terraform"
  }
}
