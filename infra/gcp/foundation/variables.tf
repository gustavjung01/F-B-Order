variable "project_id" {
  description = "Google Cloud project ID for Bếp Sỉ."
  type        = string

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{4,28}[a-z0-9]$", var.project_id))
    error_message = "project_id must be a valid Google Cloud project ID."
  }
}

variable "region" {
  description = "Primary Google Cloud region."
  type        = string
  default     = "asia-southeast1"
}

variable "environment" {
  description = "Environment label used by foundational resources."
  type        = string
  default     = "prod"

  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "environment must be dev, staging, or prod."
  }
}

variable "artifact_registry_repository_id" {
  description = "Artifact Registry Docker repository ID."
  type        = string
  default     = "bepsi-containers"
}

variable "runtime_service_account_id" {
  description = "Cloud Run runtime service account ID."
  type        = string
  default     = "bepsi-api-runtime"
}

variable "deploy_service_account_id" {
  description = "GitHub Actions deployment service account ID."
  type        = string
  default     = "bepsi-github-deployer"
}

variable "workload_identity_pool_id" {
  description = "Workload Identity Pool ID for GitHub Actions."
  type        = string
  default     = "github-actions"
}

variable "workload_identity_provider_id" {
  description = "Workload Identity Provider ID for GitHub OIDC."
  type        = string
  default     = "github"
}

variable "github_repository" {
  description = "GitHub repository allowed to impersonate the deployment service account."
  type        = string
  default     = "gustavjung01/F-B-Order"

  validation {
    condition     = can(regex("^[^/]+/[^/]+$", var.github_repository))
    error_message = "github_repository must use owner/repository format."
  }
}

variable "github_ref" {
  description = "Exact Git ref allowed to deploy through Workload Identity Federation."
  type        = string
  default     = "refs/heads/main"

  validation {
    condition     = startswith(var.github_ref, "refs/")
    error_message = "github_ref must start with refs/."
  }
}

variable "secret_ids" {
  description = "Secret Manager containers created without secret versions."
  type        = set(string)
  default = [
    "bepsi-database-url",
    "bepsi-clerk-secret-key",
  ]
}

variable "labels" {
  description = "Additional labels applied to supported resources."
  type        = map(string)
  default     = {}
}
