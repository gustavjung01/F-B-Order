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
6. Ảnh thiếu không chặn SKU; bổ sung thủ công sau. Không tạo ảnh AI.
7. Không commit workbook, payload giá hoặc báo cáo production vào repo public.
8. Không apply khi chưa có `DRY_RUN_PASS` và phê duyệt production rõ ràng.
9. Sản phẩm bán theo hộp/gói đếm được phép dùng `measureMode=COUNT_ONLY`: bắt buộc `sellUnit`, `packageQuantity`, `packageUnit`; `netQuantity/netUnit` được để trống khi nguồn không công bố khối lượng.
10. Không điền `0` hoặc tự đoán khối lượng để vượt validator.

## Trạng thái

- `PENDING_USER_REVIEW`: đã kê mapping, chờ duyệt.
- `MAPPING_APPROVED`: SKU cũ–mới và quy cách đã duyệt, chờ audit.
- `AUDIT_PASS`: dữ liệu và ảnh đạt theo chính sách task.
- `DRY_RUN_PASS`: kế hoạch thay đổi read-only đã đạt.
- `APPROVED`: được duyệt để apply.
- `APPLIED`: đã ghi production có batch/snapshot.
- `VERIFIED`: đã hậu kiểm.

## Tiến độ nhóm Trà

| Thứ tự | Task | SKU chuẩn | Trạng thái | Ghi chú |
|---:|---|---:|---|---|
| 1 | `TEA-NOVIA-01` | 3 | `DRY_RUN_PASS` | Chờ migration 031 và phê duyệt apply |
| 2 | `TEA-BATCH-02` | 18 | `DRY_RUN_PASS` | Audit và dry-run production read-only 18/18 PASS |
| 3 | `TEA-BATCH-03` | 27 | `MAPPING_APPROVED` | 27/27 đã duyệt; 8 remap + 19 create-new; 14 measured + 13 count-only; chờ audit read-only |

# TEA-NOVIA-01 — Trà Novia

- Mapping: `BGKQ-0170 → TRGANO`, `BGKQ-0171 → TRDENN`, `BGKQ-0172 → TRLANO`.
- Giữ nguyên 3 `variantId` và ảnh R2 cũ.
- Audit và dry-run production read-only đã PASS.
- Migration bắt buộc trước apply: `db/migrations/031_catalog_group_remap.sql`.
- Chưa chạy migration hoặc apply production.

# TEA-BATCH-02 — Batch Trà 18 SKU

- 16 `REMAP` + 2 `CREATE_NEW`: `TXABON`, `TXABIE`.
- Hai SKU mới không alias `BGKQ-0169`; SKU cũ tiếp tục tồn tại độc lập.
- `BGKQ-0177 → TRGAON` thiếu ảnh được chấp nhận.
- Ảnh `TXABON`, `TXABIE`, `TRGAON` bổ sung thủ công sau.
- Payload private: `data/private/catalog-imports/tea-batch-02.private.json`.
- Payload hash: `64788440c741397acf8ecd74fd821b376f474cb43af861d2b4d8f918d1d243e5`.
- `BATCH_AUDIT_PASS`: 18/18, blocked=0.
- `BATCH_DRY_RUN_PASS`: 18/18, blocked=0.
- `canApplyNow=false`, `canApplyAfterMigration=true`.
- Chưa migrate 031, chưa apply, chưa ghi R2.

# TEA-BATCH-03 — Batch Trà 27 SKU

## Phạm vi đã duyệt

- Review: `data/catalog-remap/tea-batch-03-review.csv`.
- Manifest: `data/catalog-remap/tea-batch-03.json`.
- Sổ SKU–ảnh: `data/catalog-remap/sku-image-transition.csv`.
- Tổng cộng: 8 `REMAP` + 19 `CREATE_NEW`.
- Quy cách: 14 `MEASURED` + 13 `COUNT_ONLY`.
- 27/27 mapping và quy cách đã được người dùng duyệt.
- Tất cả ảnh `CREATE_NEW` chờ bổ sung thủ công; không tạo ảnh AI.

Các SKU gộp cũ vẫn tồn tại độc lập, chưa alias hoặc deactivate:

```text
BGKQ-0162 — Trà sen/lài Phúc Long
BGKQ-0164 — Trà sen/lài Thái Nguyên
BGKQ-0166 — Cozy hòa tan gộp
BGKQ-0167 — Cozy túi lọc gộp
BGKQ-0168 — Trà Thái xanh/đỏ gộp
```

## Quy cách người dùng chốt trực tiếp

```text
HTRKIG = MEASURED; 500 g/bịch; 30 bịch/bao
TR9DXN = MEASURED; 500 g/bịch; 10 bịch/thùng
TRLPLL = COUNT_ONLY; bán theo hộp; 20 hộp/thùng
TROPLL = COUNT_ONLY; bán theo hộp; 20 hộp/thùng
COZMAT = MEASURED; 1000 g/bịch; 30 bịch/thùng
```

- `TRLPLL` và `TROPLL` là trà túi lọc theo hộp; không điền gram giả.
- `COZMAT` dùng 1 kg theo xác nhận trực tiếp của người dùng, thay cho quy cách 200 g trong bảng nguồn cũ.
- 11 SKU Cozy mới dùng `COUNT_ONLY`, bán theo hộp và 30 hộp/thùng.

## Hỗ trợ kỹ thuật COUNT_ONLY

Đã hoàn thiện trên branch:

- Validator hỗ trợ `measured | count_only`, tương thích payload cũ.
- Validator tiếp tục chặn khối lượng `0` và chặn `COUNT_ONLY` có net fields giả.
- Migration: `db/migrations/032_catalog_packaging_count_only.sql`.
- API trả packaging cho hàng đếm theo hộp dù không có gram.
- Frontend hiển thị `30 hộp/thùng`, không hiển thị `0 g` hoặc `null g`.
- Test validator `MEASURED + COUNT_ONLY + backward compatibility` đã PASS cục bộ.
- GitHub CI của head mới được kích hoạt; chỉ ghi PASS khi workflow hoàn tất thành công.

## Payload riêng tư

```text
data/private/catalog-imports/tea-batch-03.private.json
```

- Payload gồm 27 dòng.
- Payload hash: `1191f9072d6a3679082bdda2b137220bc514a605679a34ba23682da9b6542ff0`.
- File nằm trong `.gitignore`; không commit.
- Payload đã qua validator cục bộ với 14 `MEASURED` và 13 `COUNT_ONLY`.

## Cổng tiếp theo

Chỉ chạy audit production read-only:

```powershell
pnpm catalog:remap:batch:audit -- --manifest=data/catalog-remap/tea-batch-03.json --commercial-file=data/private/catalog-imports/tea-batch-03.private.json
```

Báo cáo local:

```text
artifacts/catalog-remap/tea-batch-03-audit.json
artifacts/catalog-remap/tea-batch-03-audit.csv
```

- Chưa chạy dry-run trước khi audit PASS và người dùng kiểm kết quả.
- Chưa chạy migration 031 hoặc 032.
- Chưa apply production, upload ảnh hoặc ghi R2.

## Production gate chung

Chỉ thực hiện khi có phê duyệt riêng, rõ ràng:

1. Chạy migration `db/migrations/031_catalog_group_remap.sql` trên đúng backend Bếp Sỉ.
2. Trước batch có `COUNT_ONLY`, chạy thêm `db/migrations/032_catalog_packaging_count_only.sql`.
3. Apply đúng task bằng manifest hash, before/after snapshot và rollback batch.
4. Hậu kiểm API, frontend, cart, order và recipe.
5. Không thao tác backend khác trên cùng VPS.
