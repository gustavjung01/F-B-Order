# Google Cloud infrastructure

Thư mục này chứa hạ tầng Google Cloud được quản lý bằng Terraform.

## Cấu trúc

```text
infra/gcp/bootstrap   # Tạo GCS bucket giữ remote state, chạy bằng local state một lần
infra/gcp/foundation  # API, Artifact Registry, service accounts, WIF và Secret Manager
```

## Nguyên tắc an toàn

- Không lưu service-account key JSON trong repo hoặc GitHub Secrets.
- GitHub Actions xác thực bằng OIDC và Workload Identity Federation.
- `terraform.tfvars`, state, plan và file override không được commit.
- A0 không tạo Cloud Run service, không deploy image và không thay đổi VPS.
- Secret Manager chỉ tạo secret container; giá trị secret phải được thêm ngoài Terraform.

## Kiểm tra cục bộ

```bash
terraform fmt -check -recursive infra/gcp

terraform -chdir=infra/gcp/bootstrap init -backend=false
terraform -chdir=infra/gcp/bootstrap validate

terraform -chdir=infra/gcp/foundation init -backend=false
terraform -chdir=infra/gcp/foundation validate
```

Runbook đầy đủ nằm tại `docs/cloud/A0_GOOGLE_CLOUD_FOUNDATION.md`.
