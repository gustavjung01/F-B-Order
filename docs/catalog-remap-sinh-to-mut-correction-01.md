# Sinh tố / Mứt Correction 01

## Vì sao có correction riêng

Batch trước đã đổi thành công 23 SKU và lưu alias `SKU cũ → SKU mới` để đổi tên ảnh sau. Không chạy lại batch cũ và không phục hồi SKU `BGKQ`.

Read-only production audit ngày 2026-07-26 xác nhận chỉ còn hai dòng chưa remap:

- `BGKQ-0021 → BERKWI`
- `BGKQ-0032 → STGPBT`

Correction này xử lý đúng trạng thái thật:

- 23 `UPDATE_EXISTING`: giữ nguyên canonical SKU và `variantId`, chỉ sửa parent/name/brand/options/giá/quy cách.
- 2 `REMAP`: đổi hai SKU còn thiếu và tạo alias lịch sử.
- 0 `CREATE_NEW`.

## Thuộc tính chuẩn

- Berino: `productType=sinh-to`, 1350 g/chai, 12 chai/thùng.
- Goldenfarm: `productType=mut`, 1300 g/chai, 12 chai/thùng.
- `flavor` tách riêng theo từng SKU.
- `measureKind=mass`; không đổi g sang ml/lít.

## Log ảnh

Toàn bộ alias cũ được giữ nguyên. Correction dry-run bắt buộc kiểm alias cũ vẫn trỏ đúng canonical SKU. Ảnh chỉ đổi tên sau khi hoàn tất toàn bộ catalog:

- không ghi/xóa R2;
- không đổi image object key trong correction;
- không tạo ảnh AI;
- không xóa log map cũ.

## Chuẩn bị private payload

Từ repo root:

```powershell
pnpm --filter @fb-order/backend catalog:sinh-to-mut:correction:prepare-private
```

File local-only được tạo:

`data/private/catalog-imports/sinh-to-mut-correction-01.private.json`

Giá được giữ từ bảng chuẩn/private payload hiện tại. Hai giá đã xác nhận:

- `BERKWI = 108000`
- `STGPBT = 120000`

## Self-test

```powershell
pnpm --filter @fb-order/backend catalog:sinh-to-mut:correction:self-test
```

Kết quả:

`SINH_TO_MUT_CORRECTION_SELF_TEST_PASS`

## Dry-run production read-only

```powershell
pnpm --filter @fb-order/backend catalog:sinh-to-mut:correction:dry-run
```

Kết quả bắt buộc:

```text
SINH_TO_MUT_CORRECTION_DRY_RUN_PASS
rows=25
pass=25
blocked=0
UPDATE_EXISTING=23
REMAP=2
```

Dry-run không migration, không DB write, không restart service và không R2 write.

## Production gate

Chưa có quyền apply production cho correction này. Engine và VPS wrapper trong PR hiện cố ý khóa `--apply` và `--rollback`.

Chỉ được xây dựng và chạy apply sau khi:

1. private payload correction hợp lệ;
2. self-test PASS;
3. VPS dry-run 25/25 PASS;
4. CI PASS;
5. project owner cấp quyền production riêng đúng task `SINH-TO-MUT-CORRECTION-01`.
