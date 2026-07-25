# Catalog remap progress

> Tracker bền vững cho việc chuẩn hóa catalog theo từng nhóm. Cập nhật file này sau mỗi bước; không dùng lịch sử chat làm nguồn tiến độ.

- Cập nhật: 2026-07-25
- Nguồn đối chiếu: `BANG_GIA_KENH_QUAN_THEM_NHOM_CHI_TIET.xlsx`
- Nhánh: `agent/catalog-commercial-map-trial`
- PR: #106
- Chế độ hiện tại: **audit/dry-run only — chưa apply production**

## Quy tắc bắt buộc

1. Làm từng `Nhóm chuẩn → Nhóm chi tiết`, không remap toàn bộ catalog cùng lúc.
2. Cấu trúc chuẩn: `Ngành → Nhóm chuẩn → Nhóm chi tiết/hãng → Sản phẩm → Variant/SKU`.
3. SKU mới phải khớp một-một với đúng sản phẩm/vị. SKU cũ được giữ làm `legacySku`/alias.
4. Giữ `productId` và `variantId` khi quan hệ cũ–mới là một-một; không xóa rồi tạo lại.
5. Ảnh R2 được map qua `imageObjectKey`; không đổi tên/xóa object R2 trong cùng task remap SKU.
6. Mỗi SKU phải có đủ: đơn vị bán lẻ, dung tích/khối lượng, số lượng/thùng, đơn vị thùng, giá lẻ và giá thùng tham chiếu hoặc giá thùng độc lập có nguồn.
7. Không được dùng giá thùng tham chiếu như một mức chiết khấu thật.
8. Một nhóm chỉ được apply sau khi dry-run PASS, báo cáo ảnh PASS và được duyệt rõ ràng.
9. File tracker không ghi giá chi tiết để tránh phát tán dữ liệu thương mại trong repo public.

## Trạng thái

- `TODO`: chưa audit
- `AUDIT`: đang đối chiếu dữ liệu cũ/mới
- `BLOCKED`: thiếu hoặc xung đột dữ liệu
- `DRY_RUN_PASS`: đạt toàn bộ kiểm tra đọc-only
- `APPROVED`: đã được duyệt để apply
- `APPLIED`: đã ghi production có batch/snapshot
- `VERIFIED`: đã kiểm tra UI, API, ảnh và dữ liệu sau apply

## Tổng quan nguồn dữ liệu

Workbook hiện có **343 dòng**, gồm các nhóm chuẩn sau:

| Nhóm chuẩn | Số SKU | Trạng thái |
|---|---:|---|
| Trà | 48 | AUDIT |
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

Thứ tự ưu tiên dựa trên độ sạch của SKU cũ–mới, quy cách và khả năng map ảnh.

| Thứ tự | Nhóm chi tiết/hãng | SKU | Trạng thái | Ghi chú |
|---:|---|---:|---|---|
| 1 | Novia | 3 | AUDIT | Pilot đầu tiên; quan hệ SKU cũ–mới một-một |
| 2 | Hoàng Gia | 3 | TODO | Quy cách tương đối đồng nhất |
| 3 | GTP | 1 | TODO | Nhóm nhỏ, dễ xác nhận |
| 4 | ONA | 7 | TODO | Cần kiểm ảnh và một số liên kết cũ |
| 5 | Lộc Phát | 4 | TODO | Cần rà đủ variant cũ |
| 6 | King | 3 | BLOCKED | Có dòng dung tích/khối lượng bằng 0 |
| 7 | Phúc Long | 4 | BLOCKED | Có dấu hiệu SKU cũ gộp nhiều loại trà |
| 8 | Thái Nguyên | 2 | BLOCKED | Một SKU cũ có thể phải tách sen/lài |
| 9 | Trà Thái | 4 | BLOCKED | Nhiều SKU mới có thể tranh cùng SKU cũ |
| 10 | Cozy | 13 | BLOCKED | Nhiều dạng sản phẩm/quy cách, cần chia nhỏ hơn |
| 11 | Tân Nam Bắc | 3 | BLOCKED | Chưa có đối chiếu SKU cũ đủ chắc chắn |
| 12 | Douxian | 1 | BLOCKED | Thiếu dung tích/khối lượng hợp lệ |

## Task đang chạy: Trà → Novia

### Phạm vi

| Legacy SKU | SKU mới | Tên chuẩn | Nhóm chuẩn | Nhóm chi tiết |
|---|---|---|---|---|
| `BGKQ-0170` | `TRGANO` | Trà gạo Novia | Trà | Novia |
| `BGKQ-0171` | `TRDENN` | Trà đen Novia | Trà | Novia |
| `BGKQ-0172` | `TRLANO` | Trà lài Novia | Trà | Novia |

### Checklist tiến độ

- [ ] Audit 3 record catalog cũ: `productId`, `variantId`, SKU, tên, giá, trạng thái
- [ ] Audit 3 `imageObjectKey` R2 và xác nhận đúng ảnh gạo/đen/lài
- [ ] Xác nhận `500 g/bịch`, `20 bịch/thùng` cho cả 3 SKU
- [ ] Tạo manifest `legacySku → canonicalSku → imageObjectKey`
- [ ] Kiểm tra tìm kiếm bằng SKU cũ và SKU mới
- [ ] Kiểm tra đơn hàng/công thức/giỏ hàng không gãy liên kết
- [ ] Chạy dry-run chỉ cho 3 SKU Novia
- [ ] Báo cáo diff: nhóm, SKU, tên, ảnh, giá lẻ/thùng, quy cách
- [ ] Duyệt thủ công
- [ ] Apply có hash + snapshot + rollback batch
- [ ] Kiểm tra sau apply trên API và frontend

### Tiêu chí PASS

Nhóm Novia chỉ PASS khi:

- Đúng `Nhóm chuẩn = Trà`, `Nhóm chi tiết = Novia`.
- Có đúng 3 SKU mới, không trùng và không map nhầm vị.
- Ba SKU cũ tồn tại dưới dạng alias/legacy mapping.
- `productId`/`variantId` được giữ nguyên khi remap một-một.
- 3/3 ảnh R2 tồn tại, mở được và đúng sản phẩm.
- 3/3 SKU đủ thông tin lẻ/thùng và dung tích/khối lượng, không có `0`/`null`.
- Giá lẻ và giá thùng được phân biệt rõ; không tạo chiết khấu giả.
- Dry-run không thay đổi SKU ngoài Novia và trả `canApply: true`.
- Sau apply, API/frontend, đơn hàng cũ và công thức vẫn hoạt động.

## Mốc gần nhất

- Payload remap an toàn 55 SKU đã `DRY_RUN_PASS` nhưng **đang giữ, chưa apply**.
- Hướng hiện tại: ưu tiên chuẩn hóa SKU theo từng nhóm trước; bắt đầu bằng Novia.
- Việc tiếp theo: tạo audit/report Novia 3 SKU, chưa ghi production.

## Quy tắc cập nhật file

Sau mỗi lần làm việc, cập nhật tối thiểu:

1. Trạng thái hàng tương ứng trong bảng tiến độ.
2. Checklist task đang chạy.
3. `Mốc gần nhất` và `Việc tiếp theo`.
4. Commit/batch/hash liên quan nếu có.
