# A1a – AI schema

## Mục tiêu

A1a định nghĩa contract ổn định giữa các module Bếp Sỉ và AI gateway trước khi nối model thật.

A1a bao gồm:

- Request schema version `1.0`.
- Danh sách use case được phép.
- Text input và JSON context có giới hạn kích thước.
- Text output hoặc structured JSON output.
- JSON Schema subset được kiểm soát, không hỗ trợ `$ref`, tool, URL hoặc mã thực thi.
- Generation controls có giới hạn.
- Success/error response envelope.
- PostgreSQL audit schema chỉ lưu metadata, fingerprint, token count và latency.

A1a không:

- Gọi Vertex AI hoặc model khác.
- Cho client chọn provider/model.
- Cho client gửi system instruction.
- Cho model gọi tool hoặc thực hiện side effect.
- Lưu raw prompt, raw context hoặc raw model output trong database.
- Deploy Google Cloud hoặc VPS.

## Use cases

```text
recipe_draft
catalog_enrichment
customer_support_draft
operations_assistant
```

Mỗi use case sẽ được A1b ánh xạ sang policy phía server gồm model, system instruction, output budget và quyền truy cập.

## Request contract

Text response:

```json
{
  "schemaVersion": "1.0",
  "useCase": "operations_assistant",
  "input": {
    "text": "Tổng hợp các việc cần xử lý hôm nay.",
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
  },
  "metadata": {
    "correlationId": "ops-20260627"
  }
}
```

Structured response:

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
        "yield": { "type": "integer" },
        "ingredients": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "name": { "type": "string" },
              "quantity": { "type": "number" },
              "unit": { "type": "string" }
            },
            "required": ["name", "quantity", "unit"]
          }
        }
      },
      "required": ["title", "yield", "ingredients"]
    }
  }
}
```

## Giới hạn contract

- `input.text`: tối đa 20.000 ký tự.
- `input.context`: JSON object tối đa 20.000 ký tự sau serialization.
- `temperature`: từ `0` đến `1`.
- `maxOutputTokens`: từ `1` đến `8192`.
- JSON response schema: tối đa 6 tầng.
- Mỗi object schema: tối đa 64 properties.
- Enum: tối đa 100 primitive values.
- Property names: ASCII identifier ổn định, tối đa 64 ký tự.
- `additionalProperties` luôn bị ép thành `false`.

## Audit table

`ai_gateway_runs` lưu:

- Request UUID và schema version.
- Use case, provider và model.
- Actor type/ID.
- Trạng thái request.
- SHA-256 request fingerprint.
- Character count, token count và latency.
- Finish reason, error code, safety metadata và request metadata đã lọc.
- Timestamps.

Bảng không có cột raw prompt hoặc raw output.

## Kiểm tra

```powershell
pnpm --filter @fb-order/backend test:ai-schema
pnpm db:test:migrations
pnpm db:migrate
pnpm --filter @fb-order/backend db:verify:ai-schema
pnpm typecheck
pnpm run build:backend
```

Không chạy migration vào production trong A1a.
