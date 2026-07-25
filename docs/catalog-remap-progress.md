# Catalog remap progress

> Tracker chính cho việc chuẩn hóa catalog theo từng nhóm. Sau mỗi task phải cập nhật file này và `data/catalog-remap/sku-image-transition.csv`; không lấy lịch sử chat làm nguồn tiến độ.

- Cập nhật: 2026-07-25
- Nguồn: `BANG_GIA_KENH_QUAN_THEM_NHOM_CHI_TIET.xlsx`
- Nhánh: `agent/catalog-commercial-map-trial`
- PR: #106 — draft, chưa merge
- Production: chưa migrate, chưa apply, chưa đổi/xóa ảnh R2

## Quy tắc bắt buộc

1. Làm theo `Nhóm chuẩn → Nhóm chi tiết/hãng → Sản phẩm → Variant/SKU`.
2. Mỗi SKU phải ghi `legacySku → canonicalSku` trong sổ chuyển đổi.
3. Giữ `variantId`; khi gộp sản phẩm phải xử lý recipe giữ cả `variantId + productId` trong cùng transaction.
4. SKU cũ phải tồn tại qua alias sau khi đổi SKU chính.
5. Remap SKU và migration ảnh R2 là hai giai đoạn riêng.
6. Ảnh cũ chỉ xóa sau khi ảnh mới đã upload đủ, DB chuyển key, API/frontend PASS và có manifest rollback.
7. Không commit workbook, payload giá hoặc báo cáo production vào repo public.
8. Không apply khi chưa có `DRY_RUN_PASS` và phê duyệt rõ ràng.

## Trạng thái

- `TODO`: chưa làm
- `AUDIT`: đang đối chiếu
- `AUDIT_PASS`: dữ liệu và ảnh cũ đã đạt
- `BLOCKED`: có xung đột hoặc thiếu dữ liệu
- `DRY_RUN_PASS`: kế hoạch thay đổi read-only đã đạt
- `APPROVED`: đã được duyệt để apply
- `APPLIED`: đã ghi production có batch/snapshot
- `VERIFIED`: đã kiểm API, frontend, dữ liệu và ảnh sau apply

## Tổng quan nhóm

| Nhóm chuẩn | SKU | Trạng thái |
|---|---:|---|
| Trà | 48 | ĐANG LÀM |
| Siro | 99 | TODO |
| Sinh tố / mứt | 40 | TODO |
| Khác | 32 | TODO |
| Flan / pudding | 15 | TODO |
| Muỗng | 14 | TODO |
| Thực phẩm đông lạnh | 11 | TODO |
| 3Q / thạch hũ | 10 | TODO |
| Sốt topping | 10 | TODO |
| Đường đen / đường nước | 9 | TODO |
| Bột cacao / socola / môn | 9 | TODO |
| Trái cây hộp | 8 | TODO |
| Ống hút | 8 | TODO |
| Bột sữa / milkfoam | 6 | TODO |
| Trân châu | 5 | TODO |
| Nguyên liệu mì cay | 5 | TODO |
| Nguyên liệu bánh tráng | 5 | TODO |
| Rau câu | 3 | TODO |
| Sữa đặc | 2 | TODO |
| Nắp | 2 | TODO |
| Bao ly / cuộn ép | 2 | TODO |

## Tiến độ nhóm Trà

| Thứ tự | Hãng/nhóm chi tiết | SKU | Trạng thái | Ghi chú |
|---:|---|---:|---|---|
| 1 | Novia | 3 | DRY_RUN_PASS | Chờ migration 031 và phê duyệt apply |
| 2 | Hoàng Gia | 3 | TODO | Nhóm kế tiếp |
| 3 | GTP | 1 | TODO | Nhóm nhỏ |
| 4 | ONA | 7 | TODO | Cần rà liên kết cũ |
| 5 | Lộc Phát | 4 | TODO | Cần rà variant cũ |
| 6 | King | 3 | BLOCKED | Có khối lượng bằng 0 |
| 7 | Phúc Long | 4 | BLOCKED | Có dấu hiệu SKU cũ gộp nhiều loại |
| 8 | Thái Nguyên | 2 | BLOCKED | Có thể phải tách sen/lài |
| 9 | Trà Thái | 4 | BLOCKED | Nhiều SKU mới có thể tranh SKU cũ |
| 10 | Cozy | 13 | BLOCKED | Nhiều dạng sản phẩm/quy cách |
| 11 | Tân Nam Bắc | 3 | BLOCKED | Thiếu đối chiếu chắc chắn |
| 12 | Douxian | 1 | BLOCKED | Khối lượng chưa hợp lệ |

# Task TEA-NOVIA-01 — Trà Novia

## Mapping SKU và ảnh

| SKU cũ | SKU mới | Tên chuẩn | Ảnh cũ | Ảnh mới dự kiến |
|---|---|---|---|---|
| `BGKQ-0170` | `TRGANO` | Trà gạo Novia | `bgkq-0170` | `trgano.webp` |
| `BGKQ-0171` | `TRDENN` | Trà đen Novia | `bgkq-0171` | `trdenn.webp` |
| `BGKQ-0172` | `TRLANO` | Trà lài Novia | `bgkq-0172` | `trlano.webp` |

Sổ máy đọc: `data/catalog-remap/sku-image-transition.csv`.

## Cấu trúc đích

- Product cha: `Trà Novia` (`productKey = tra-novia`).
- Product sống tiếp: product chứa `BGKQ-0170`.
- Giữ nguyên 3 `variantId`.
- SKU mới: `TRGANO`, `TRDENN`, `TRLANO`.
- SKU cũ được lưu qua alias.
- Quy cách mỗi SKU: `500 g/bịch`, `20 bịch/thùng`.
- Giữ nguyên object key ảnh R2 trong task remap SKU.
- Ảnh mới chỉ upload theo đợt migration ảnh cuối dự án.

## Kết quả đã xác nhận

### Audit

- Trạng thái: `AUDIT_PASS`.
- 3 SKU cũ khớp đúng variant.
- 3 SKU mới chưa bị chiếm.
- Giá, quy cách và tên nguồn đạt.
- 3 ảnh cũ mở được và đã kiểm đúng gạo/đen/lài.
- Không thay đổi production.

### Dry-run

- Trạng thái: `REMAP_DRY_RUN_PASS`.
- Phân loại: `PASS_WITH_EXISTING_PRODUCT_CONSOLIDATION`.
- `canApplyNow = false`.
- `canApplyAfterMigration = true`.
- Migration bắt buộc trước apply: `db/migrations/031_catalog_group_remap.sql`.
- Trạng thái `legacy_products_not_one_per_source_row` được xác nhận là tình trạng gộp product hiện hữu, không phải blocker SKU.
- Không chạy migration, không ghi DB, không ghi R2, không restart/deploy.

Báo cáo local, đã bị `.gitignore`:

```text
artifacts/catalog-remap/tea-novia-audit.json
artifacts/catalog-remap/tea-novia-audit.csv
artifacts/catalog-remap/tea-novia-dry-run.json
artifacts/catalog-remap/tea-novia-dry-run.csv
```

## Checklist

- [x] Đối chiếu 3 dòng workbook
- [x] Ghi 3 cặp SKU cũ–mới vào sổ chuyển đổi
- [x] Xác nhận `500 g/bịch`, `20 bịch/thùng`
- [x] Audit production read-only
- [x] Kiểm thủ công 3 ảnh cũ
- [x] Xác nhận không trùng SKU mới
- [x] Tạo migration alias/batch `031`; chưa chạy production
- [x] Dry-run production read-only
- [x] Xác nhận giữ `variantId`, cart/order và kế hoạch cập nhật recipe
- [x] Nâng task lên `DRY_RUN_PASS`
- [ ] Điền `currentObjectKey` thật vào sổ chuyển đổi từ báo cáo local
- [ ] Duyệt migration 031 và kế hoạch apply
- [ ] Apply có manifest hash + snapshot + rollback batch
- [ ] Hậu kiểm API/frontend/cart/order/recipe
- [ ] Giữ ảnh R2 cũ tới đợt migration ảnh cuối

## Cổng apply Novia

Chỉ được apply sau khi có phê duyệt rõ ràng cho cả hai việc:

1. Chạy migration `031_catalog_group_remap.sql` trên đúng backend Bếp Sỉ.
2. Apply remap đúng task `TEA-NOVIA-01` với hash, snapshot và rollback.

Không dùng lệnh apply chung cho backend khác trên VPS.

## Việc tiếp theo

- Novia: chờ phê duyệt migration/apply; không tự chạy production.
- Catalog: bắt đầu task `TEA-HOANG-GIA-02`, ghi SKU cũ–mới và ảnh vào sổ trước khi audit.
