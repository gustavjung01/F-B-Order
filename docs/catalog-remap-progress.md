# Catalog remap progress

> Tracker chính cho việc chuẩn hóa catalog theo từng nhóm. Sau mỗi task phải cập nhật file này và `data/catalog-remap/sku-image-transition.csv`; không lấy lịch sử chat làm nguồn tiến độ.

- Cập nhật: 2026-07-25
- Nguồn: `BANG_GIA_KENH_QUAN_THEM_NHOM_CHI_TIET.xlsx`
- Nhánh: `agent/catalog-commercial-map-trial`
- PR: #106 — draft, chưa merge
- Production: chưa migrate, chưa apply, chưa đổi/xóa ảnh R2

## Quy tắc bắt buộc

1. Làm theo `Nhóm chuẩn → Nhóm chi tiết/hãng → Sản phẩm → Variant/SKU`.
2. Mỗi SKU phải có hành động rõ ràng: `REMAP legacySku → canonicalSku` hoặc `CREATE_NEW` khi không có SKU cũ đúng nghĩa.
3. Không ép SKU mới vào SKU cũ chỉ vì tên gần giống. SKU `CREATE_NEW` không được tạo alias giả.
4. Giữ `variantId`; khi gộp sản phẩm phải xử lý recipe giữ cả `variantId + productId` trong cùng transaction.
5. SKU cũ phải tồn tại qua alias sau khi đổi SKU chính đối với hành động `REMAP`.
6. Remap SKU và migration ảnh R2 là hai giai đoạn riêng.
7. Ảnh thiếu không chặn tạo/remap SKU nếu đã được ghi nhận rõ; bổ sung ảnh thủ công sau.
8. Không tạo ảnh AI cho catalog. Ảnh sản phẩm phải do người dùng cung cấp hoặc lấy từ nguồn sản phẩm đã duyệt.
9. Ảnh cũ chỉ xóa sau khi ảnh mới đã upload đủ, DB chuyển key, API/frontend PASS và có manifest rollback.
10. Không commit workbook, payload giá hoặc báo cáo production vào repo public.
11. Không apply khi chưa có `DRY_RUN_PASS` và phê duyệt rõ ràng.

## Trạng thái

- `TODO`: chưa làm
- `PENDING_USER_REVIEW`: đã kê mapping, chờ duyệt SKU cũ–mới
- `AUDIT`: đang đối chiếu production
- `AUDIT_PASS`: dữ liệu và ảnh cũ đã đạt
- `BLOCKED`: có xung đột hoặc thiếu dữ liệu bắt buộc
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

| Thứ tự | Task | SKU chuẩn | Trạng thái | Ghi chú |
|---:|---|---:|---|---|
| 1 | TEA-NOVIA-01 | 3 | DRY_RUN_PASS | Chờ migration 031 và phê duyệt apply |
| 2 | TEA-BATCH-02 | 18 | PENDING_USER_REVIEW | 16 remap + 2 create-new; không tạo ảnh AI |
| 3 | Phần Trà còn lại | 27 | TODO | Kê batch 15–30 SKU sau khi batch 02 được chốt |

# Task TEA-NOVIA-01 — Trà Novia

## Mapping SKU và ảnh

| SKU cũ | SKU mới | Tên chuẩn | Ảnh cũ | Ảnh mới dự kiến |
|---|---|---|---|---|
| `BGKQ-0170` | `TRGANO` | Trà gạo Novia | `bgkq-0170` | `trgano.webp` |
| `BGKQ-0171` | `TRDENN` | Trà đen Novia | `bgkq-0171` | `trdenn.webp` |
| `BGKQ-0172` | `TRLANO` | Trà lài Novia | `bgkq-0172` | `trlano.webp` |

- Trạng thái: `DRY_RUN_PASS`.
- Giữ nguyên 3 `variantId` và ảnh R2 cũ.
- Migration bắt buộc trước apply: `db/migrations/031_catalog_group_remap.sql`.
- Chưa chạy migration hoặc apply production.

# Task TEA-BATCH-02 — Batch Trà 18 SKU

Nguồn review máy đọc:

```text
data/catalog-remap/tea-batch-02-review.csv
```

## Phạm vi chờ duyệt

- 16 SKU dùng hành động `REMAP`.
- `TXABON` — Thái xanh B-One: `CREATE_NEW`, không alias `BGKQ-0169`.
- `TXABIE` — Thái xanh Biên: `CREATE_NEW`, không alias `BGKQ-0169`.
- `BGKQ-0177 → TRGAON`: remap hợp lệ nhưng người dùng xác nhận không có ảnh thực tế.
- Ảnh của SKU mới và `TRGAON` để trạng thái chờ bổ sung thủ công.
- Không tạo ảnh AI.
- Chưa tạo manifest audit/apply cho tới khi người dùng duyệt bảng SKU.

## Việc tiếp theo

1. Người dùng duyệt hoặc sửa bảng 18 SKU trong `tea-batch-02-review.csv`.
2. Sau khi được chốt, chuyển các dòng sang sổ `sku-image-transition.csv`.
3. Tạo manifest batch hỗ trợ đồng thời `REMAP` và `CREATE_NEW`.
4. Chạy audit và dry-run read-only một lần cho đủ batch.
5. Không chạy migration/apply/R2 nếu chưa có phê duyệt production riêng.
