# Siro Batch 02

## Phạm vi sạch

- 30 SKU duy nhất
- 1 REMAP: `BGKQ-0008 → SRVNTA`
- 29 CREATE_NEW
- Pixie: 11
- Vina: 18, bao gồm `SRVNSD`
- Mama: 1

## Backlog chuẩn hóa chung

- 29 dòng cần chuẩn hóa quy cách hoặc đơn vị
- 1 dòng `GTPDAU` là nguồn trùng, đã hoàn tất trong SIRO-BATCH-01
- Không bỏ dòng nào
- Toàn bộ nằm trong `data/catalog-remap/catalog-normalization-backlog.csv`
- Các batch sau chỉ append vào file chung này
- Không xử lý lẻ từng nhóm; đợi map xong toàn bộ catalog rồi kiểm backlog một lần
- Backlog công khai không chứa giá private

Nhóm lỗi chính:

- Định lượng bằng 0
- Tên ghi 2L/700ml nhưng quy cách nguồn ghi kg/g
- Xung đột thương hiệu hoặc tên bảng quán
- Nguồn trùng SKU đã xử lý

## Hash

- Manifest: `61d0b49504d4bb917f05a6a62104e39ef2f9533e5b8861d17cf9a20b0c1cd812`
- Private payload: `e8b0c5517fc3be9c26a1f1ab345f74f441032ccd1f3df77f42f641f149ce6743`

## Kiểm tra

- Static contract: PASS
- Database dry-run: PASS
- Rows: 30
- Pass: 30
- Blocked: 0
- Production modified: false

## Cổng an toàn

- Private payload không commit Git
- Chưa apply production
- Không migration, restart service hoặc ghi/xóa R2
