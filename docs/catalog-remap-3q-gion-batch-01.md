# Catalog Remap — 3Q Giòn Batch 01

## Phạm vi

- Task: `3Q-GION-BATCH-01`
- 12 SKU sạch
- 10 `REMAP` giữ `variantId`
- 2 `CREATE_NEW`: `3QBBDA`, `3QBBDO`
- 6 parent: Bibi, Sea, Zion, OK, Douxian, Hùng Chương

## Mapping

| Legacy | Canonical | Tên | Chế độ |
|---|---|---|---|
| BGKQ-0076 | 3QBBTR | 3Q BIBI TRẮNG | COUNT_ONLY |
| BGKQ-0077 | 3QBBDE | 3Q BIBI ĐEN | COUNT_ONLY |
| — | 3QBBDA | 3Q BIBI DÂU | COUNT_ONLY |
| — | 3QBBDO | 3Q BIBI ĐÀO | COUNT_ONLY |
| BGKQ-0078 | 3QSEAT | 3Q SEA TRẮNG | COUNT_ONLY |
| BGKQ-0079 | 3QSEAD | 3Q SEA ĐEN | COUNT_ONLY |
| BGKQ-0080 | 3QZITR | 3Q ZION TRẮNG | 2000 g |
| BGKQ-0081 | 3QZIDE | 3Q ZION ĐEN | 2000 g |
| BGKQ-0082 | 3QOKTR | 3Q OK TRẮNG | COUNT_ONLY |
| BGKQ-0083 | 3QOKOL | 3Q OK OLONG | 2000 g |
| BGKQ-0084 | 3QHUDX | THẠCH 3Q HỦ | 2600 g |
| BGKQ-0086 | THCFHC | THẠCH CAFE HÙNG CHƯƠNG | 2600 g |

## Quy cách

- Tất cả: 6 đơn vị/thùng.
- `COUNT_ONLY`: Bibi 4 SKU, Sea 2 SKU, OK Trắng. Không ghi `0 g`.
- Measured:
  - Zion Trắng/Đen: 2.000 g/gói.
  - OK Olong: 2.000 g/gói.
  - Thạch 3Q Hủ: 2.600 g/hộp.
  - Thạch Cafe Hùng Chương: 2.600 g/hủ.

## Giá đã đối chiếu

- `3QZIDE` dùng giá chuẩn **55.000đ**; giá cũ **52.000đ** không được dùng để ghi đè.
- Hai SKU Bibi Dâu/Đào cùng dòng nguồn với Bibi Đen, cùng giá đơn vị **52.000đ**.
- Giá thương mại nằm trong private payload local-only; không commit Git.

## Hai dòng HOLD

1. `BGKQ-0085` — Thạch Douxian các loại:
   - tên nguồn không chỉ ra vị/canonical SKU;
   - gợi ý tự động trỏ sang thạch 3D không đủ tin cậy;
   - không remap.

2. `BGKQ-0087` — Thủy Tinh Hùng Chương:
   - chưa xác định chính xác vị/canonical SKU;
   - gợi ý Hạt Thủy Tinh Nho/Dưa Lưới chưa đủ chứng cứ;
   - không remap.

Hai dòng này được append vào `data/catalog-remap/catalog-normalization-backlog.csv`.

## Static contract

```text
CONTRACT_PASS
rows=12
REMAP=10
CREATE_NEW=2
MEASURED=5
COUNT_ONLY=7
```

- Manifest hash: `3dee21674bd79e42e855ebdc6440ba011abe5aa53a4268a6381a51c1930f2972`
- Private payload hash: `1f795c686bdc4e3f4f0c7aa53717be2757b8926219c3d7299aebce9d895fcff5`
- Giá thùng = giá đơn vị × 6: PASS
- Canonical SKU duy nhất: PASS
- Legacy SKU duy nhất: PASS
- Không có `0 g` trong manifest: PASS

## Read-only production verification

`audit-catalog-remap-batch.mjs` chỉ nhận batch từ 15 đến 30 dòng. Không dùng runner đó cho batch 12 dòng này và không hạ cổng an toàn 15–30.

Chạy plan dry-run engine; runner tự thực hiện local self-test, khóa đúng `/srv/apps/bepsi`, mở transaction `BEGIN READ ONLY`, kiểm toàn bộ 12 dòng và rollback transaction sau khi đọc:

```powershell
node .\apps\backend\scripts\run-catalog-remap-plan-dry-run-vps-root.mjs `
  --plan=data/catalog-remap/3q-gion-batch-01-plan.json
```

Kết quả bắt buộc:

```text
CATALOG_REMAP_PLAN_DRY_RUN_PASS
3Q-GION-BATCH-01: BATCH_DRY_RUN_PASS
rows=12
pass=12
blocked=0
```

Report local:

`artifacts/catalog-remap/production/3q-gion-batch-01-dry-run.json`

## An toàn

- Chưa database dry-run PASS cho đến khi có output thật từ plan runner.
- Chưa apply production.
- Không migration.
- Không restart service.
- Không ghi/xóa R2.
- Ảnh xử lý sau khi toàn bộ catalog được verify.
