# A0 – Google Cloud foundation

## Mục tiêu

A0 dựng nền Google Cloud tối thiểu để các bước sau có thể build và deploy backend Bếp Sỉ mà không dùng service-account key dài hạn.

A0 tạo:

- GCS bucket giữ Terraform remote state.
- Các Google Cloud API cần cho Cloud Run, Artifact Registry, IAM, logging và Secret Manager.
- Artifact Registry Docker repository.
- Runtime service account dành cho backend API.
- GitHub deployment service account.
- Workload Identity Pool và GitHub OIDC provider.
- IAM tối thiểu cho GitHub deployer và runtime identity.
- Secret Manager containers cho `DATABASE_URL` và `CLERK_SECRET_KEY`, không tạo secret version.

A0 không:

- Tạo hoặc deploy Cloud Run service.
- Build/push container image.
- Chuyển database.
- Thay đổi Vercel.
- Thao tác VPS, `/srv/apps/bepsi`, `bepsi-api.service` hoặc backend website còn lại trên VPS.

## Kiến trúc nền

```text
GitHub Actions
  └─ OIDC token
      └─ Workload Identity Federation
          └─ bepsi-github-deployer
              ├─ ghi image vào Artifact Registry
              ├─ phát hành Cloud Run revision ở bước sau
              ├─ xem metadata Secret Manager
              └─ impersonate bepsi-api-runtime

bepsi-api-runtime
  └─ đọc đúng các runtime secrets được khai báo
```

Workload Identity Provider mặc định chỉ chấp nhận:

```text
repository: gustavjung01/F-B-Order
ref:        refs/heads/main
```

## Điều kiện trước khi apply

- Đã tạo Google Cloud project và bật billing.
- Tài khoản chạy bootstrap có quyền tạo GCS bucket, bật API, tạo service account và sửa IAM.
- Đã cài `gcloud` và Terraform `>= 1.8`.
- Đã chọn một tên GCS bucket duy nhất toàn cầu.

Đăng nhập cho Terraform:

```powershell
 gcloud auth login
 gcloud auth application-default login
 gcloud config set project <GCP_PROJECT_ID>
```

## Bước 1 – Bootstrap remote state

```powershell
cd "F:\1_A_Disk_D\F&B-Order"
Copy-Item infra/gcp/bootstrap/terraform.tfvars.example infra/gcp/bootstrap/terraform.tfvars
```

Sửa `infra/gcp/bootstrap/terraform.tfvars`:

```hcl
project_id            = "your-project-id"
state_bucket_name     = "your-globally-unique-bepsi-tf-state"
state_bucket_location = "ASIA-SOUTHEAST1"
```

Kiểm tra và apply:

```powershell
terraform -chdir=infra/gcp/bootstrap init
terraform -chdir=infra/gcp/bootstrap fmt -check
terraform -chdir=infra/gcp/bootstrap validate
terraform -chdir=infra/gcp/bootstrap plan -out=a0-bootstrap.tfplan
terraform -chdir=infra/gcp/bootstrap apply a0-bootstrap.tfplan
```

Ghi lại output `state_bucket_name`.

Bootstrap dùng local state. Giữ file state bootstrap ở nơi an toàn; không commit vào Git.

## Bước 2 – Khởi tạo foundation bằng remote state

```powershell
Copy-Item infra/gcp/foundation/terraform.tfvars.example infra/gcp/foundation/terraform.tfvars
```

Sửa `infra/gcp/foundation/terraform.tfvars`, ít nhất phải thay `project_id`.

Khởi tạo backend bằng bucket vừa tạo:

```powershell
terraform -chdir=infra/gcp/foundation init `
  -backend-config="bucket=<STATE_BUCKET_NAME>" `
  -backend-config="prefix=bepsi/a0-foundation"
```

Kiểm tra trước khi apply:

```powershell
terraform fmt -check -recursive infra/gcp
terraform -chdir=infra/gcp/foundation validate
terraform -chdir=infra/gcp/foundation plan -out=a0-foundation.tfplan
```

Chỉ apply khi plan đúng phạm vi A0:

```powershell
terraform -chdir=infra/gcp/foundation apply a0-foundation.tfplan
```

## Bước 3 – Ghi nhận outputs cho GitHub

```powershell
terraform -chdir=infra/gcp/foundation output
```

Tạo GitHub repository variables từ output:

| GitHub variable | Giá trị |
| --- | --- |
| `GCP_PROJECT_ID` | Google Cloud project ID |
| `GCP_REGION` | `asia-southeast1` hoặc region đã chọn |
| `GCP_ARTIFACT_REGISTRY_REPOSITORY` | output `artifact_registry_repository` |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | output `github_workload_identity_provider` |
| `GCP_DEPLOY_SERVICE_ACCOUNT` | output `github_deployer_service_account` |
| `GCP_RUNTIME_SERVICE_ACCOUNT` | output `runtime_service_account` |

Không tạo GitHub secret chứa service-account JSON.

Workflow deploy ở bước sau phải có:

```yaml
permissions:
  contents: read
  id-token: write
```

## Bước 4 – Thêm runtime secret values ngoài Terraform

A0 chỉ tạo secret containers:

```text
bepsi-database-url
bepsi-clerk-secret-key
```

Secret values phải được thêm trực tiếp bằng Google Cloud Console hoặc `gcloud secrets versions add`. Không đặt giá trị secret trong:

- `terraform.tfvars`.
- Terraform state.
- GitHub repository variables.
- File `.env` được commit.
- Workflow YAML.

## Kiểm tra sau apply

```powershell
gcloud artifacts repositories describe bepsi-containers `
  --location=asia-southeast1 `
  --project=<GCP_PROJECT_ID>

gcloud iam service-accounts describe `
  bepsi-api-runtime@<GCP_PROJECT_ID>.iam.gserviceaccount.com

gcloud iam service-accounts describe `
  bepsi-github-deployer@<GCP_PROJECT_ID>.iam.gserviceaccount.com

gcloud secrets describe bepsi-database-url --project=<GCP_PROJECT_ID>
gcloud secrets describe bepsi-clerk-secret-key --project=<GCP_PROJECT_ID>
```

## CI A0

`.github/workflows/a0-google-cloud-foundation.yml` chỉ chạy:

- `terraform fmt -check`.
- `terraform init -backend=false`.
- `terraform validate`.

CI A0 không xác thực Google Cloud và không chạy `terraform plan/apply`.

## Definition of done

A0 hoàn tất khi:

- Terraform bootstrap và foundation đều validate.
- Remote state bucket tồn tại, chặn public access và bật versioning.
- Required APIs đã bật.
- Artifact Registry repository tồn tại.
- Runtime và deploy service accounts tồn tại.
- GitHub WIF provider bị giới hạn đúng repo/ref.
- Không có service-account key JSON.
- Secret containers tồn tại nhưng không có giá trị trong Git/Terraform.
- GitHub variables đã được ghi nhận.
- Không có Cloud Run service hoặc thay đổi production ngoài phạm vi.

## Bước kế tiếp

A1 mới thực hiện:

- Dockerfile production cho backend.
- Build image bất biến theo commit SHA.
- Push image vào Artifact Registry.
- Tạo Cloud Run service/revision.
- Gắn runtime service account và Secret Manager versions.
- Health check, smoke test và rollback.
