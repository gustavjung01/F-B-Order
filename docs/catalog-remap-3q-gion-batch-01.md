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

- Manifest hash: `588f522afba4aca8a6d4a59a7a81c48e5ec66afc2a28dca6439ed0920f97765a`
- Private payload hash: `1f795c686bdc4e3f4f0c7aa53717be2757b8926219c3d7299aebce9d895fcff5`
- Giá thùng = giá đơn vị × 6: PASS
- Canonical SKU duy nhất: PASS
- Legacy SKU duy nhất: PASS
- Không có `0 g` trong manifest: PASS

## Read-only production verification

`audit-catalog-remap-batch.mjs` chỉ nhận batch từ 15 đến 30 dòng. Batch 12 dòng này dùng plan dry-run engine và không hạ cổng an toàn 15–30.

### Lượt đầu — BLOCKED 10/12

```text
CATALOG_REMAP_PLAN_DRY_RUN_BLOCKED
rows=12
pass=10
blocked=2
BGKQ-0082 -> 3QOKTR: target_parent_blocked
BGKQ-0083 -> 3QOKOL: target_parent_blocked
```

Nguyên nhân: product key `3q-ok` đã tồn tại ở parent đích khác với parent hiện tại của survivor `BGKQ-0082`. Hai legacy SKU vẫn tồn tại và không có blocker dữ liệu khác.

Manifest chỉ đổi chiến lược parent `OK` từ `merge_keep_first_product` sang `attach_to_existing_or_create_parent`. Không đổi SKU, giá, quy cách, ảnh hoặc private payload.

### Lượt mới — PASS 12/12

```text
CATALOG_REMAP_PLAN_DRY_RUN_PASS
3Q-GION-BATCH-01: BATCH_DRY_RUN_PASS
rows=12
pass=12
blocked=0
```

- Ngày xác nhận: `2026-07-27`.
- Runner dùng transaction `BEGIN READ ONLY` và không ghi production.
- Report local: `artifacts/catalog-remap/production/3q-gion-batch-01-dry-run.json`.

## Trạng thái

- Static contract: PASS.
- CI: PASS.
- VPS dry-run: PASS 12/12.
- PR vẫn draft.
- Chưa apply production.
- Không migration.
- Không restart service.
- Không ghi/xóa R2.
- Ảnh xử lý sau khi toàn bộ catalog được verify.
