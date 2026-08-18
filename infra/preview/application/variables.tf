variable "image_tag" {
  description = "Full container image reference to deploy, e.g. <acr-login-server>/taskflow-api:<tag>. Must be pushed to platform's registry before applying, so this has no default."
  type        = string
}

variable "container_app_name" {
  description = "Name of the Container App."
  type        = string
  default     = "ca-taskflow-api-preview"
}

variable "cpu" {
  description = "vCPU allocation for the single preview replica."
  type        = number
  default     = 0.5
}

variable "memory" {
  description = "Memory allocation for the single preview replica."
  type        = string
  default     = "1Gi"
}
