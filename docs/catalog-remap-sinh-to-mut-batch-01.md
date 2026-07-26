# Sinh tố / Mứt Batch 01

## Phạm vi sạch

- 25 SKU duy nhất
- 24 REMAP giữ variantId
- 1 CREATE_NEW: `BERMCA`
- Berino: 13 SKU
- Gold: 12 SKU

## Hai vị đã chuẩn hóa

- `BGKQ-0021` → `BERKWI`: Berino Kiwi, 1350 g/chai, 12 chai/thùng
- `BGKQ-0032` → `STGPBT`: Mứt Gold Phúc Bồn Tử, 1300 g/chai, 12 chai/thùng
- Hai dòng được đưa từ HOLD sang READY trong manifest chính.
- Backlog vẫn giữ nguyên dấu vết mã cũ, lý do HOLD và kết quả xử lý để phục vụ audit/rollback/map ảnh sau.

## Backlog chuẩn hóa chung

- Batch từng append 17 dòng vào `data/catalog-remap/catalog-normalization-backlog.csv`
- Đã xử lý 2 dòng: `BERKWI`, `STGPBT`
- Còn 15 dòng HOLD chưa giải quyết:
  - 11 SKU Vina 1L: tên 1L nhưng nguồn ghi 1300 g/chai
  - 4 SKU Vina 650G: nguồn ghi 0 g/hủ
- Backlog công khai không chứa giá private

## Hash và payload private

- Manifest mới: `3b33ea2ea913519bff313f872aabbcff8364430a9001a71b7469aa7a905d852e`
- Private payload hiện vẫn là bản 23 SKU, hash cũ: `70b271a96bff58d159510ecaa47cae8f631e76a61f415561a5d64be23db191ab`
- Phải bổ sung hai dòng thương mại `BGKQ-0021` và `BGKQ-0032` vào `data/private/catalog-imports/sinh-to-mut-batch-01.private.json`, rồi chạy lại contract để tạo payload hash mới.

## Cổng an toàn

- Public manifest/review: đã chuẩn hóa 25 SKU
- Static contract: BLOCKED đến khi refresh private payload
- Database dry-run: chưa chạy
- Production apply: chưa chạy
- Không migration, restart service hoặc ghi/xóa R2
