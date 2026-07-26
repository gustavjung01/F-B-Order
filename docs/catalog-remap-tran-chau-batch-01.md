# Trân châu Batch 01

## Phạm vi sạch

- 4 SKU duy nhất
- 4 REMAP giữ variantId
- Không CREATE_NEW
- Gia Uy: 3 SKU
- Kunhan: 1 SKU

## Mapping thủ công đã khóa

- `TCMNGU`: `BGKQ-0068 → TCMNGU`
- `TCTRGU`: `BGKQ-0070 → TCTRGU`
- `TCCFGU`: `BGKQ-0071 → TCCFGU`; variant MINI là `BGKQ-0068`, không trùng
- `KH2KDD`: `BGKQ-0073 → KH2KDD` theo tên legacy 2kg và quy cách 10 hộp/thùng
- `TCDDGU` đã xử lý trong `DUONG-DEN-BATCH-01`, không map lại

## Backlog chuẩn hóa chung

- Append 1 dòng vào `data/catalog-remap/catalog-normalization-backlog.csv`
- Không tạo note/Excel riêng
- `KH3KHK`: tên bảng quán ghi Duoxian nhưng tên chuẩn hóa ghi Kunhan; candidate legacy `BGKQ-0067` cũng là Douxian

## Hash

- Manifest: `2a7998459e7a8c2fe3b703434bb664fba337c21a0236e65d5582c9ec2b446e6c`
- Private payload: `75dd72b024cbeddaf4b631dc4b17eaac49a407058faf7e94893b56d9253c7dc3`

## Cổng an toàn

- Static contract: PASS
- Database dry-run: chưa chạy
- Production apply: chưa chạy
- Không migration, restart service hoặc ghi/xóa R2
