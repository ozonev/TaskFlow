variable "location" {
  description = "Azure region for the preview environment."
  type        = string
  default     = "North Europe"
}

variable "resource_group_name" {
  description = "Name of the resource group that holds every preview resource."
  type        = string
  default     = "rg-taskflow-preview"
}

variable "suffix_length" {
  description = "Length of the random suffix appended to globally-unique resource names (storage account, container registry)."
  type        = number
  default     = 5
}
