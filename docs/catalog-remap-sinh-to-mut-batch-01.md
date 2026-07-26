# Sinh tố / Mứt Batch 01

## Phạm vi sạch

- 23 SKU duy nhất
- 22 REMAP giữ variantId
- 1 CREATE_NEW: `BERMCA`
- Berino: 12 SKU
- Gold: 11 SKU

## Backlog chuẩn hóa chung

- Append 17 dòng vào `data/catalog-remap/catalog-normalization-backlog.csv`
- Không tạo note/Excel riêng
- Đợi map xong toàn bộ catalog rồi kiểm backlog một lần
- Backlog công khai không chứa giá private

Các dòng hold gồm:

- `BERKWI`: nguồn ghi 13 g/chai
- `STGPBT`: nguồn ghi 0 g/chai
- 11 SKU Vina 1L: tên 1L nhưng nguồn ghi 1300 g/chai
- 4 SKU Vina 650G: nguồn ghi 0 g/hủ

## Hash

- Manifest: `0e487351acd04657fe3ea7fa2eb0426e0e95f1fd277d7d094c240e36b1a07706`
- Private payload: `70b271a96bff58d159510ecaa47cae8f631e76a61f415561a5d64be23db191ab`

## Cổng an toàn

- Static contract: PASS
- Database dry-run: chưa chạy
- Production apply: chưa chạy
- Không migration, restart service hoặc ghi/xóa R2
