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
- `MAPPING_APPROVED`: SKU cũ–mới đã duyệt, chờ đủ dữ liệu để audit.
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
| 3 | `TEA-BATCH-03` | 27 | `PENDING_USER_REVIEW` | 16 SKU đã duyệt quy cách; còn 11 SKU chờ duyệt; không còn dòng thiếu quy cách trong phần đã duyệt |

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

## Phạm vi

- File review: `data/catalog-remap/tea-batch-03-review.csv`.
- Tổng cộng: 8 `REMAP` + 19 `CREATE_NEW`.
- Không ép SKU tách vị vào các SKU gộp cũ.
- Các SKU gộp cũ vẫn tồn tại độc lập, chưa alias hoặc deactivate:
  - `BGKQ-0162` — Trà sen/lài Phúc Long.
  - `BGKQ-0164` — Trà sen/lài Thái Nguyên.
  - `BGKQ-0166` — Cozy hòa tan gộp.
  - `BGKQ-0167` — Cozy túi lọc gộp.
  - `BGKQ-0168` — Trà Thái xanh/đỏ gộp.
- Tất cả ảnh `CREATE_NEW` chờ bổ sung thủ công; không tạo ảnh AI.

## Cụm Cozy đã `MAPPING_APPROVED`

```text
COHTBD
COHTVA
COHTOI
COHTDO
COHTDA
COHTCH
COHTCD
COTLVA
COTLHT
COTLDO
COTLDA
```

Quy cách đã chốt cho cả 11 SKU Cozy:

```text
measureMode = COUNT_ONLY
sellUnit = hộp
packageQuantity = 30
packageUnit = thùng
netQuantity = null
netUnit = null
```

- Nhóm `COHT*` là dạng gói/túi trong hộp.
- Nhóm `COTL*` là túi lọc trong hộp.
- Không alias vào `BGKQ-0166` hoặc `BGKQ-0167`.
- Không bắt buộc gram khi nguồn chỉ công bố quy cách đếm theo hộp.
- Có thể bổ sung số túi/hộp hoặc khối lượng sau khi có dữ liệu thật.
- Schema hỗ trợ: `db/migrations/032_catalog_packaging_count_only.sql`.
- Migration 032 chỉ mở kiểu dữ liệu `COUNT_ONLY`; không remap SKU và chưa chạy production.

## Năm SKU vừa chốt quy cách

```text
HTRKIG = MEASURED; 500 g/bịch; 30 bịch/bao
TR9DXN = MEASURED; 500 g/bịch; 10 bịch/thùng
TRLPLL = COUNT_ONLY; 1 hộp; 20 hộp/thùng
TROPLL = COUNT_ONLY; 1 hộp; 20 hộp/thùng
COZMAT = MEASURED; 1000 g/bịch; 30 bịch/thùng
```

- `TRLPLL` và `TROPLL` là trà túi lọc theo hộp; không điền gram giả.
- `COZMAT` dùng 1 kg theo xác nhận trực tiếp của người dùng, thay cho quy cách 200 g trong bảng nguồn cũ.
- Cả 5 SKU đã chuyển sang `MAPPING_APPROVED` trong file review.

## Cổng tiếp theo

1. Duyệt hoặc sửa 11 SKU còn lại trong `tea-batch-03-review.csv`.
2. Hoàn thiện validator/importer/API/frontend cho `COUNT_ONLY` trước khi tạo manifest.
3. Khi đủ hai điều kiện mới tạo manifest, payload private và chạy audit read-only.
4. Chưa cập nhật `sku-image-transition.csv` cho batch 03 trước khi toàn bộ mapping được duyệt.
5. Không chạy migration, apply, upload ảnh hoặc ghi R2 trong bước review.

## Production gate chung

Chỉ thực hiện khi có phê duyệt riêng, rõ ràng:

1. Chạy migration `db/migrations/031_catalog_group_remap.sql` trên đúng backend Bếp Sỉ.
2. Trước batch có `COUNT_ONLY`, chạy thêm `db/migrations/032_catalog_packaging_count_only.sql`.
3. Apply đúng task bằng manifest hash, before/after snapshot và rollback batch.
4. Hậu kiểm API, frontend, cart, order và recipe.
5. Không thao tác backend khác trên cùng VPS.
