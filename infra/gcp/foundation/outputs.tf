output "project_number" {
  description = "Numeric Google Cloud project identifier."
  value       = data.google_project.current.number
}

output "artifact_registry_repository" {
  description = "Docker repository path used by later build and deploy stages."
  value       = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.containers.repository_id}"
}

output "runtime_service_account" {
  description = "Service account reserved for the Bếp Sỉ API runtime."
  value       = google_service_account.runtime.email
}

output "github_deployer_service_account" {
  description = "Service account impersonated by GitHub Actions."
  value       = google_service_account.github_deployer.email
}

output "github_workload_identity_provider" {
  description = "Full Workload Identity Provider resource name."
  value       = google_iam_workload_identity_pool_provider.github.name
}

output "secret_resource_names" {
  description = "Secret Manager resources created without versions."
  value = {
    for secret_id, secret in google_secret_manager_secret.runtime :
    secret_id => secret.name
  }
}
