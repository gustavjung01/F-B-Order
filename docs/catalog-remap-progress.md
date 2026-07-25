# Catalog remap progress

> Tracker chính cho việc chuẩn hóa catalog. Sau mỗi task phải cập nhật file này và `data/catalog-remap/sku-image-transition.csv`; không lấy lịch sử chat làm nguồn tiến độ.

- Cập nhật: 2026-07-25
- Nguồn: `BANG_GIA_KENH_QUAN_THEM_NHOM_CHI_TIET.xlsx`
- Nhánh: `agent/catalog-commercial-map-trial`
- PR: #106 — draft, chưa merge
- Production: chưa migrate, chưa apply, chưa đổi/xóa ảnh R2

## Quy tắc bắt buộc

1. Mỗi SKU có hành động rõ ràng: `REMAP legacySku → canonicalSku` hoặc `CREATE_NEW`.
2. Không ép SKU mới vào SKU cũ gần giống; `CREATE_NEW` không tạo alias giả.
3. Batch review gồm 15–30 SKU để duyệt một lượt.
4. `REMAP` giữ `variantId`; khi gộp product phải cập nhật recipe giữ cả `variantId + productId` trong cùng transaction.
5. Remap SKU và migration ảnh R2 là hai giai đoạn riêng.
6. Ảnh thiếu đã ghi nhận không chặn SKU; bổ sung ảnh thủ công sau.
7. Không tạo ảnh AI cho catalog.
8. Không commit workbook, payload giá hoặc báo cáo production vào repo public.
9. Không apply khi chưa có `DRY_RUN_PASS` và phê duyệt production rõ ràng.

## Trạng thái

- `TODO`: chưa làm
- `PENDING_USER_REVIEW`: đã kê mapping, chờ duyệt
- `MAPPING_APPROVED`: SKU cũ–mới đã duyệt, chờ audit
- `AUDIT`: đang đối chiếu production
- `AUDIT_PASS`: dữ liệu và ảnh đạt theo chính sách task
- `BLOCKED`: có xung đột hoặc thiếu dữ liệu bắt buộc
- `DRY_RUN_PASS`: kế hoạch thay đổi read-only đã đạt
- `APPROVED`: được duyệt để apply
- `APPLIED`: đã ghi production có batch/snapshot
- `VERIFIED`: đã hậu kiểm

## Tiến độ nhóm Trà

| Thứ tự | Task | SKU chuẩn | Trạng thái | Ghi chú |
|---:|---|---:|---|---|
| 1 | `TEA-NOVIA-01` | 3 | `DRY_RUN_PASS` | Chờ migration 031 và phê duyệt apply |
| 2 | `TEA-BATCH-02` | 18 | `MAPPING_APPROVED` | 16 remap + 2 create-new; audit read-only đã sẵn sàng |
| 3 | Phần Trà còn lại | 27 | `TODO` | Kê batch tiếp theo sau khi batch 02 audit |

# Task TEA-NOVIA-01 — Trà Novia

- Mapping: `BGKQ-0170 → TRGANO`, `BGKQ-0171 → TRDENN`, `BGKQ-0172 → TRLANO`.
- Trạng thái: `DRY_RUN_PASS`.
- Giữ nguyên 3 `variantId` và ảnh R2 cũ.
- Migration bắt buộc trước apply: `db/migrations/031_catalog_group_remap.sql`.
- Chưa chạy migration hoặc apply production.

# Task TEA-BATCH-02 — Batch Trà 18 SKU

## Phạm vi đã duyệt

- 16 dòng `REMAP`.
- 2 dòng `CREATE_NEW`:
  - `TXABON` — Thái xanh B-One.
  - `TXABIE` — Thái xanh Biên.
- Hai SKU mới không alias `BGKQ-0169`; SKU cũ này tiếp tục tồn tại độc lập.
- `BGKQ-0177 → TRGAON` thiếu ảnh được chấp nhận.
- Ảnh `TXABON`, `TXABIE` và `TRGAON` bổ sung thủ công sau.
- Không tạo ảnh AI.

## File theo dõi

```text
data/catalog-remap/tea-batch-02-review.csv
data/catalog-remap/tea-batch-02.json
data/catalog-remap/sku-image-transition.csv
```

Manifest batch dùng schema 2, hỗ trợ đồng thời `REMAP` và `CREATE_NEW`.

## Payload riêng tư

Đặt file riêng tư tại:

```text
data/private/catalog-imports/tea-batch-02.private.json
```

- Payload hash: `64788440c741397acf8ecd74fd821b376f474cb43af861d2b4d8f918d1d243e5`
- Không commit file này.
- Payload chứa 18 dòng giá/quy cách đã duyệt.

## Audit batch read-only

Lệnh:

```powershell
git pull --ff-only origin agent/catalog-commercial-map-trial
pnpm catalog:remap:batch:audit -- --commercial-file=data/private/catalog-imports/tea-batch-02.private.json
```

Kết quả local:

```text
artifacts/catalog-remap/tea-batch-02-audit.json
artifacts/catalog-remap/tea-batch-02-audit.csv
```

Audit kiểm:

- 16 legacy SKU tồn tại đúng một variant.
- 18 canonical SKU chưa bị chiếm.
- Hai `CREATE_NEW` không có alias legacy.
- Giá, tên, nhóm và quy cách khớp payload riêng tư.
- Product cha theo từng hãng không va chạm.
- Ảnh hiện hữu mở được, trừ các dòng đã được phép thiếu ảnh.
- Migration `031` đã có hay chưa.
- Không sửa DB, R2, service hoặc production.

## Cổng tiếp theo

1. Chạy audit batch read-only.
2. Nếu `BATCH_AUDIT_PASS`, tạo dry-run batch cho đủ 18 SKU.
3. Không chạy migration/apply/R2 nếu chưa có phê duyệt production riêng.
