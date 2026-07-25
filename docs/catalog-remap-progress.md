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
| 2 | `TEA-BATCH-02` | 18 | `DRY_RUN_PASS` | Audit và dry-run production read-only 18/18 PASS |
| 3 | `TEA-BATCH-03` | 27 | `PENDING_USER_REVIEW` | 8 remap + 19 create-new; 12 SKU thiếu net quantity |

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
data/catalog-remap/tea-batch-02-audit-verification.json
data/catalog-remap/tea-batch-02-dry-run-verification.json
data/catalog-remap/sku-image-transition.csv
```

## Payload riêng tư

```text
data/private/catalog-imports/tea-batch-02.private.json
```

- Payload hash: `64788440c741397acf8ecd74fd821b376f474cb43af861d2b4d8f918d1d243e5`.
- Payload chứa 18 dòng giá/quy cách đã duyệt.
- File nằm trong `.gitignore`; không commit.

## Kết quả audit

- `BATCH_AUDIT_PASS`.
- 18/18 dòng PASS, 0 BLOCKED.
- Chỉ đọc production; không sửa DB, R2 hoặc service.

Báo cáo local:

```text
artifacts/catalog-remap/tea-batch-02-audit.json
artifacts/catalog-remap/tea-batch-02-audit.csv
```

## Kết quả dry-run

- `BATCH_DRY_RUN_PASS`.
- 18/18 dòng PASS, 0 BLOCKED.
- `canApplyNow = false`.
- `canApplyAfterMigration = true`.
- Thiếu migration `031` là cổng hạ tầng trước apply, không phải blocker dữ liệu.
- 16 `variantId` remap được giữ nguyên.
- Dự kiến tạo 16 alias SKU cũ.
- `TXABON` và `TXABIE` được tạo mới, không có alias legacy.
- Cart/order giữ tham chiếu qua `variantId`.
- Recipe được liệt kê phần cần đổi `catalog_product_id` và snapshot.
- Ảnh R2 hiện hữu được giữ nguyên; 3 ảnh thiếu chờ bổ sung thủ công.
- `generateImages = false`, `r2Writes = 0`.
- Không sửa DB, R2, service hoặc production.

Báo cáo local:

```text
artifacts/catalog-remap/tea-batch-02-dry-run.json
artifacts/catalog-remap/tea-batch-02-dry-run.csv
```

## Cổng production

Chỉ được thực hiện khi có phê duyệt riêng, rõ ràng:

1. Chạy migration `db/migrations/031_catalog_group_remap.sql` trên đúng backend Bếp Sỉ.
2. Apply task `TEA-BATCH-02` bằng manifest hash, before/after snapshot và rollback batch.
3. Hậu kiểm API, frontend, cart, order và recipe.
4. Không tạo/upload/xóa ảnh trong task SKU.
5. Không thao tác backend khác trên cùng VPS.

# Task TEA-BATCH-03 — Batch Trà 27 SKU

## Phạm vi đang chờ duyệt

- File review: `data/catalog-remap/tea-batch-03-review.csv`.
- Tổng cộng 27 SKU: 8 dòng `REMAP`, 19 dòng `CREATE_NEW`.
- Không ép các SKU tách vị vào SKU gộp cũ.
- Các SKU gộp cũ tiếp tục tồn tại độc lập, chưa alias hoặc deactivate:
  - `BGKQ-0162` — Trà sen/lài Phúc Long.
  - `BGKQ-0164` — Trà sen/lài Thái Nguyên.
  - `BGKQ-0166` — Trà Cozy hòa tan gộp.
  - `BGKQ-0167` — Trà Cozy túi lọc gộp.
  - `BGKQ-0168` — Trà Thái xanh/đỏ gộp.
- `HTRLPH` là `CREATE_NEW` vì `BGKQ-0148` đã được duyệt map sang `TRLALP` trong batch 02.
- `TRQMON` là `CREATE_NEW` vì chưa có SKU cũ đúng nghĩa.
- Tất cả ảnh của `CREATE_NEW` chờ bổ sung thủ công; không tạo ảnh AI.

## Quy cách còn thiếu

12 SKU đang thiếu `netQuantity`, nên có thể duyệt mapping SKU nhưng chưa được tạo manifest audit/apply:

```text
HTRKIG
TR9DXN
TRLPLL
TROPLL
COHTBD
COHTVA
COHTOI
COHTDO
COHTDA
COHTCH
COHTCD
COZMAT
```

Các SKU này phải được bổ sung khối lượng thực trước audit. Không dùng giá trị 0 hoặc tự đoán quy cách.

## Cổng tiếp theo

1. Người dùng duyệt hoặc sửa đủ 27 cặp SKU trong `tea-batch-03-review.csv`.
2. Bổ sung `netQuantity` thật cho 12 SKU còn thiếu.
3. Sau khi đủ hai điều kiện trên mới tạo manifest, payload riêng tư và chạy audit read-only.
4. Chưa cập nhật `sku-image-transition.csv` cho batch 03 trước khi mapping được duyệt.
5. Không chạy migration, apply, upload ảnh hoặc ghi R2 trong bước review.

## Việc tiếp theo

- Catalog: chờ người dùng duyệt `TEA-BATCH-03` và bổ sung 12 quy cách còn thiếu.
- Production: giữ nguyên; chưa migration 031, chưa apply Novia hoặc batch 02.
