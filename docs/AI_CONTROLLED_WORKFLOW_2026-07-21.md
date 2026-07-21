# AI controlled workflow — 2026-07-21

## Ba tầng

### 1. AI read-only

Permission: `ai.use`.

API:

```text
POST /api/admin/ai/query
```

Backend chỉ truy vấn các scope đã allowlist:

- `orders`
- `customers`
- `catalog`
- `recipes`

Mỗi scope vẫn yêu cầu permission nghiệp vụ tương ứng như `orders.view` hoặc `recipes.view`. Model không nhận kết nối database và không được tự viết SQL.

### 2. AI draft

Permission: `ai.execute`.

API:

```text
POST /api/admin/ai/drafts
GET  /api/admin/ai/drafts
```

Draft được lưu tách biệt trong `ai_drafts` với các loại:

- `recipe`
- `customer_reply`
- `catalog_copy`
- `operations_note`

Draft không tự publish và không tự thay đổi dữ liệu nghiệp vụ.

### 3. AI action có phê duyệt

Tạo action yêu cầu `ai.execute`:

```text
POST /api/admin/ai/actions
```

Xem và từ chối action yêu cầu `ai.audit`:

```text
GET  /api/admin/ai/actions
POST /api/admin/ai/actions/:actionId/reject
```

Phê duyệt action yêu cầu permission nghiệp vụ ghi trong chính action request:

```text
POST /api/admin/ai/actions/:actionId/approve
```

Action đầu tiên được allowlist:

```text
append_order_internal_note
```

Permission nghiệp vụ bắt buộc:

```text
orders.internal_notes
```

Khi được phê duyệt, backend ghi chú nội bộ đơn hàng trong transaction, ghi `order_internal_note_logs`, `ai_action_events` và `admin_audit_logs`.

## Quy tắc an toàn

1. Người tạo action không thể tự duyệt.
2. Action ngoài allowlist bị từ chối.
3. Payload được validate trước khi lưu.
4. Approver phải có permission nghiệp vụ của action.
5. AI không kết nối database trực tiếp.
6. AI không được tuyên bố đã thực thi khi action còn `pending`.
7. `ai_action_events` là append-only.
8. Mọi action đã thực thi ghi audit trước/sau.

## Provider

Backend g?i Google Vertex AI Agent Runtime ?? deploy:

```text
projects/bep-si-image-worker/locations/us-west1/reasoningEngines/710557190426984448
```

C?u h?nh runtime:

```text
GOOGLE_CLOUD_PROJECT=bep-si-image-worker
GOOGLE_CLOUD_LOCATION=us-west1
GOOGLE_AGENT_ENGINE_ID=710557190426984448
GOOGLE_AGENT_ENDPOINT=https://us-west1-aiplatform.googleapis.com/v1/projects/bep-si-image-worker/locations/us-west1/reasoningEngines/710557190426984448:streamQuery
GOOGLE_AGENT_TIMEOUT_MS=90000
```

X?c th?c d?ng Application Default Credentials ho?c `GOOGLE_SERVICE_ACCOUNT_JSON_BASE64`. Kh?ng l?u service-account JSON trong repository. Service account runtime ph?i c? quy?n `aiplatform.reasoningEngines.query`, th?ng th??ng qua `roles/aiplatform.user`.

N?u ch?a c?u h?nh Google Agent Runtime, backend ch? d?ng deterministic provider cho local/test. N?u ?? c?u h?nh nh?ng Google tr? l?i IAM ho?c runtime, API tr? l?i 502/504 v? kh?ng gi? l?p k?t qu? th?nh c?ng.

## Frontend

Trang quản trị:

```text
/admin/ai
```

UI tự ẩn/hiện theo:

- `ai.use`
- `ai.execute`
- `ai.audit`
- `orders.internal_notes`

## Durable job queue

AI read-only v? AI draft kh?ng g?i Google trong request HTTP. Backend ch?p context theo permission r?i ghi `ai_jobs` v?i tr?ng th?i `pending`. Worker ch?y trong ti?n tr?nh backend VPS claim job b?ng `FOR UPDATE SKIP LOCKED`, g?i Google Agent Runtime v? l?u k?t qu? v?o `ai_interactions`/`ai_drafts`.

Tr?ng th?i:

```text
pending -> processing -> completed | failed | cancelled
```

Worker retry t?i ?a 3 l?n v?i exponential backoff, t? ph?c h?i job `processing` b? treo sau restart v? kh?ng ?? m?t job v? to?n b? tr?ng th?i n?m trong PostgreSQL. Frontend Vercel ch? enqueue v? polling `GET /api/admin/ai/jobs`; Vercel kh?ng gi? Google credential v? kh?ng ch?y AI.
