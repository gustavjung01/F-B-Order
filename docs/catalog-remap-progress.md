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
4. Khi chỉ đổi SKU một-một trên cùng sản phẩm, giữ nguyên `productId` và `variantId`.
5. Khi gộp nhiều sản phẩm cũ thành một sản phẩm cha, giữ toàn bộ `variantId`, chọn một `productId` sống tiếp và chỉ xử lý các product rỗng sau khi đã kiểm tra tham chiếu.
6. Ảnh R2 được map qua `imageObjectKey`; không đổi tên/xóa object R2 trong cùng task remap SKU.
7. Mỗi SKU phải có đủ: đơn vị bán lẻ, dung tích/khối lượng, số lượng/thùng, đơn vị thùng, giá lẻ và giá thùng tham chiếu hoặc giá thùng độc lập có nguồn.
8. Không được dùng giá thùng tham chiếu như một mức chiết khấu thật.
9. Một nhóm chỉ được apply sau khi dry-run PASS, báo cáo ảnh PASS và được duyệt rõ ràng.
10. File tracker không ghi giá chi tiết để tránh phát tán dữ liệu thương mại trong repo public.

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
| 1 | Novia | 3 | AUDIT | Manifest và audit VPS đã có; chờ báo cáo production |
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

### Cấu trúc đích

- Sản phẩm cha: `Trà Novia` (`productKey = tra-novia`).
- Product sống tiếp: product đang chứa `BGKQ-0170`.
- Giữ nguyên cả 3 `variantId`.
- Reparent variant của `BGKQ-0171` và `BGKQ-0172` vào product sống tiếp khi apply được duyệt.
- SKU mới: `TRGANO`, `TRDENN`, `TRLANO`.
- SKU cũ phải tồn tại trong alias/legacy mapping.
- Giữ nguyên `imageObjectKey` của từng SKU; không đổi tên object R2 trong task này.

### File triển khai

- Manifest công khai, không chứa giá: `data/catalog-remap/tea-novia.json`.
- Audit đọc-only: `apps/backend/scripts/audit-catalog-remap-group.mjs`.
- Runner VPS Bếp Sỉ: `apps/backend/scripts/run-catalog-remap-group-vps.mjs`.
- Báo cáo local sau chạy:
  - `artifacts/catalog-remap/tea-novia-audit.json`
  - `artifacts/catalog-remap/tea-novia-audit.csv`

### Checklist tiến độ

- [x] Xác nhận 3 dòng nguồn Novia trong workbook
- [x] Xác nhận mapping `BGKQ → SKU mới`
- [x] Xác nhận mục tiêu `500 g/bịch`, `20 bịch/thùng`
- [x] Tạo manifest nhóm Novia
- [x] Tạo audit read-only lấy `productId`, `variantId`, nhóm, giá, quy cách và ảnh R2
- [x] Tạo runner VPS chỉ giới hạn `/srv/apps/bepsi` và `bepsi-api.service`
- [ ] Chạy audit production và tải báo cáo JSON/CSV
- [ ] Xác nhận 3 `imageObjectKey` R2 mở được và đúng ảnh gạo/đen/lài
- [ ] Xác nhận không có SKU mới trùng trong production
- [ ] Xác nhận schema có chỗ lưu SKU cũ/alias
- [ ] Kiểm tra tham chiếu đơn hàng/công thức/giỏ hàng trước khi reparent
- [ ] Tạo dry-run thay đổi cho đúng 3 SKU Novia
- [ ] Duyệt thủ công
- [ ] Apply có hash + snapshot + rollback batch
- [ ] Kiểm tra sau apply trên API và frontend

### Lệnh audit hiện tại

```powershell
git pull --ff-only origin agent/catalog-commercial-map-trial
pnpm catalog:remap:audit -- --commercial-file=data/private/catalog-imports/kenh-quan-commercial-map.safe-remap.json
```

Lệnh trên chỉ đọc DB và kiểm tra URL ảnh; không sửa SKU, product, giá, quy cách, R2, cart, order hoặc recipe.

### Tiêu chí PASS audit

Audit Novia chỉ PASS khi:

- Tìm đúng một variant cho mỗi SKU cũ.
- `TRGANO`, `TRDENN`, `TRLANO` chưa bị SKU khác chiếm.
- 3 `variantId` khác nhau và đầy đủ.
- Ba dòng private payload khớp tên, nhóm, quy cách và giá nguồn.
- 3/3 ảnh có `imageObjectKey` hiệu lực và URL mở được.
- Không có product khác chiếm `productKey = tra-novia`.
- Báo cáo xác định rõ schema đã có hoặc chưa có nơi lưu legacy SKU.
- Không có thay đổi production.

### Tiêu chí PASS sau remap

- Đúng `industryKey = nguyen-lieu-tra-sua`.
- Đúng `catalogGroupKey = tra`, nhóm chi tiết/brand `Novia`.
- Có đúng một sản phẩm cha `Trà Novia` và đúng 3 variant.
- Có đúng 3 SKU mới, không trùng và không map nhầm loại.
- Ba SKU cũ tìm được qua alias/legacy mapping.
- Cả 3 `variantId` được giữ nguyên.
- 3/3 ảnh R2 giữ đúng object key và hiển thị đúng sản phẩm.
- 3/3 SKU đủ thông tin lẻ/thùng và dung tích/khối lượng, không có `0`/`null`.
- Giá lẻ và giá thùng được phân biệt rõ; không tạo chiết khấu giả.
- Đơn hàng cũ, công thức, giỏ hàng và API/frontend không gãy.

## Mốc gần nhất

- Payload remap an toàn 55 SKU đã `DRY_RUN_PASS` nhưng **đang giữ, chưa apply**.
- Manifest và audit read-only cho Novia đã được thêm vào branch.
- Việc tiếp theo: chạy audit Novia production, đọc hai báo cáo và chốt blocker thật trước khi viết migration/remap apply.
- Commit gần nhất của bước triển khai audit: `9ebcb30a`.

## Quy tắc cập nhật file

Sau mỗi lần làm việc, cập nhật tối thiểu:

1. Trạng thái hàng tương ứng trong bảng tiến độ.
2. Checklist task đang chạy.
3. `Mốc gần nhất` và `Việc tiếp theo`.
4. Commit/batch/hash liên quan nếu có.
