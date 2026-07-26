# Đường đen / Đường nước Batch 01

## Phạm vi sạch

- 6 SKU duy nhất
- 5 REMAP giữ variantId
- 1 CREATE_NEW: `SRDDER`
- Monita: 2 SKU
- Đài Loan, Mola, Erodeli, Gia Uy: mỗi nhóm 1 SKU

## Xử lý parent Gia Uy

- `TCDDGU` remap từ `BGKQ-0069`
- Tạo hoặc dùng parent `duong-den-gia-uy`
- Chỉ move variant đường đen; không đổi parent chứa các trân châu Gia Uy còn lại

## Backlog chuẩn hóa chung

- Append 3 dòng vào `data/catalog-remap/catalog-normalization-backlog.csv`
- Không tạo note/Excel riêng
- `BLAK1L`: tên 1L nhưng nguồn 1300 g/bình
- `BLAK2L`: tên 2L nhưng nguồn 2 kg/bình
- `SRDDFL`: nguồn 0 g/bình

## Hash

- Manifest: `3c809b78b665badb3902fdc19222a8beb0f217388ef4fc31b8449f52bba46776`
- Private payload: `6f66f25b311144d32afe5ea2df3e62256e5185efd85944d8d49b84e94732d2e2`

## Cổng an toàn

- Static contract: PASS
- Database dry-run: chưa chạy
- Production apply: chưa chạy
- Không migration, restart service hoặc ghi/xóa R2
