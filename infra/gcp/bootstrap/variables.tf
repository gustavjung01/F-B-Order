variable "project_id" {
  description = "Google Cloud project ID that owns the Terraform state bucket."
  type        = string

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{4,28}[a-z0-9]$", var.project_id))
    error_message = "project_id must be a valid Google Cloud project ID."
  }
}

variable "state_bucket_name" {
  description = "Globally unique GCS bucket name for Terraform remote state."
  type        = string

  validation {
    condition     = length(var.state_bucket_name) >= 3 && length(var.state_bucket_name) <= 63
    error_message = "state_bucket_name must contain between 3 and 63 characters."
  }
}

variable "state_bucket_location" {
  description = "GCS location for Terraform state."
  type        = string
  default     = "ASIA-SOUTHEAST1"
}

variable "labels" {
  description = "Labels applied to bootstrap resources."
  type        = map(string)
  default = {
    app       = "bepsi"
    component = "terraform-state"
    managedby = "terraform"
  }
}
