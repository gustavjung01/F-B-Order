output "state_bucket_name" {
  description = "GCS bucket created for Terraform remote state."
  value       = google_storage_bucket.terraform_state.name
}

output "foundation_backend_config" {
  description = "Backend values used by infra/gcp/foundation."
  value = {
    bucket = google_storage_bucket.terraform_state.name
    prefix = "bepsi/a0-foundation"
  }
}
