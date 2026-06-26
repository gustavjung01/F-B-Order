# A1b – AI gateway

## Mục tiêu

A1b cung cấp một gateway nội bộ, có kiểm soát, để backend Bếp Sỉ gọi Vertex AI theo contract A1a.

A1b bao gồm:

- Endpoint admin-only `POST /api/admin/ai/generate`.
- Provider abstraction và Vertex AI REST provider.
- Model, system instruction và policy do server kiểm soát.
- Runtime authentication bằng Google Cloud service account metadata.
- Text output và structured JSON output.
- Kiểm tra structured output lần hai sau khi model trả về.
- PostgreSQL audit metadata theo migration A1a.
- Fail-closed khi audit storage không hoạt động.
- Vertex API/IAM bổ sung trong Terraform foundation.

A1b không:

- Mở API AI công khai cho khách hàng.
- Cho caller chọn provider, model hoặc system instruction.
- Cho model gọi tool, sửa dữ liệu hoặc thực hiện side effect.
- Lưu raw prompt, raw context hoặc raw model output.
- Tự apply Terraform, deploy Cloud Run hoặc thay đổi VPS.

## Quyền truy cập

Endpoint chỉ chấp nhận Clerk identity thỏa mãn toàn bộ:

```text
kind = staff
role = admin
isActive = true
```

Anonymous, customer, unmapped identity, staff thường và staff inactive đều bị từ chối trước khi gọi provider.

## Runtime configuration

Gateway bị tắt mặc định:

```dotenv
AI_PROVIDER=disabled
```

Để bật Vertex AI ở môi trường đã được cấu hình Google Cloud:

```dotenv
AI_PROVIDER=vertex_ai
AI_VERTEX_PROJECT_ID=your-gcp-project-id
AI_VERTEX_LOCATION=asia-southeast1
AI_VERTEX_MODEL=your-approved-vertex-model-id
AI_REQUEST_TIMEOUT_MS=30000
```

Có thể dùng `GOOGLE_CLOUD_PROJECT` và `GOOGLE_CLOUD_LOCATION` thay cho hai biến project/location riêng.

`AI_VERTEX_MODEL` không có default cố định. Mỗi môi trường phải chọn rõ model đã được kiểm duyệt và khả dụng tại region đang dùng.

## Credentials

Production lấy access token ngắn hạn từ metadata server của Google Cloud runtime identity.

Không dùng:

- Service-account JSON key.
- Credential được commit vào Git.
- Credential dài hạn trong GitHub Secrets.
- Token nằm trong request của frontend.

`GOOGLE_OAUTH_ACCESS_TOKEN` chỉ dành cho kiểm tra local có chủ đích bằng token ngắn hạn. Không ghi biến này vào file được commit.

## Server policy

Mỗi A1a use case có system instruction và giới hạn riêng:

| Use case | Max temperature | Max output tokens |
| --- | ---: | ---: |
| `recipe_draft` | 0.50 | 4096 |
| `catalog_enrichment` | 0.30 | 3072 |
| `customer_support_draft` | 0.40 | 2048 |
| `operations_assistant` | 0.25 | 2048 |

Caller có thể yêu cầu giá trị thấp hơn. Gateway tự hạ mọi giá trị vượt policy.

## Request

Request dùng nguyên contract A1a:

```json
{
  "schemaVersion": "1.0",
  "useCase": "operations_assistant",
  "input": {
    "text": "Tổng hợp các việc cần xử lý.",
    "context": {
      "pendingOrders": 12
    }
  },
  "response": {
    "format": "text"
  },
  "controls": {
    "temperature": 0.2,
    "maxOutputTokens": 1024
  }
}
```

Structured output:

```json
{
  "schemaVersion": "1.0",
  "useCase": "recipe_draft",
  "input": {
    "text": "Tạo bản nháp công thức trà đào 20 ly."
  },
  "response": {
    "format": "json",
    "schema": {
      "type": "object",
      "properties": {
        "title": { "type": "string" },
        "yield": { "type": "integer" }
      },
      "required": ["title", "yield"]
    }
  },
  "controls": {
    "temperature": 0.3,
    "maxOutputTokens": 2048
  }
}
```

## Response

Success:

```json
{
  "schemaVersion": "1.0",
  "requestId": "uuid",
  "useCase": "operations_assistant",
  "provider": "vertex_ai",
  "model": "configured-model",
  "output": {
    "format": "text",
    "text": "..."
  },
  "usage": {
    "inputTokens": 100,
    "outputTokens": 50,
    "totalTokens": 150
  },
  "finishReason": "STOP",
  "latencyMs": 900
}
```

Gateway không trả system instruction, token credential hoặc raw provider payload.

## Audit behavior

Trước khi gọi model:

1. Xác thực admin.
2. Validate A1a schema.
3. Resolve server policy.
4. Tạo request UUID và SHA-256 fingerprint.
5. Ghi `ai_gateway_runs.status = started`.

Sau khi model trả về:

1. Parse output.
2. Validate structured output nếu dùng JSON.
3. Ghi token count, latency, finish reason, safety metadata và trạng thái cuối.
4. Chỉ sau khi audit hoàn tất mới trả response.

Raw input và raw output không được ghi vào database.

## Google Cloud foundation

A1b bổ sung trong Terraform:

- API `aiplatform.googleapis.com`.
- Role `roles/aiplatform.user` cho `bepsi-api-runtime`.

GitHub deployer không nhận role gọi Vertex AI.

Không apply Terraform trong A1b.

## Kiểm tra local

Dùng PostgreSQL local an toàn đã migrate:

```powershell
pnpm --filter @fb-order/backend test:ai-schema
pnpm --filter @fb-order/backend test:ai-gateway
pnpm --filter @fb-order/backend test:vertex-provider
pnpm typecheck
pnpm run build:backend

terraform fmt -check -recursive infra/gcp
terraform -chdir=infra/gcp/foundation init -backend=false
terraform -chdir=infra/gcp/foundation validate
```

Các test A1b dùng mock provider và mock fetch. Chúng không gọi Vertex AI thật.

## Definition of done

- A1a schema và database contract vẫn xanh.
- Admin authorization được kiểm tra trước provider call.
- Policy cap được áp dụng phía server.
- Text và structured JSON output hoạt động.
- Output sai schema bị từ chối và audit `failed`.
- Provider failure được chuẩn hóa và audit.
- Audit start failure chặn provider call.
- Vertex request không chứa tools.
- Terraform format/validate xanh.
- Không có Cloud apply, deploy hoặc production change.
