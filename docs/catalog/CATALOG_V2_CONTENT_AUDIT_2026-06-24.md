# Bếp Sỉ — Audit catalog v2 (24/06/2026)

## Kết luận hiện tại

- `275` SKU/variant được giữ nguyên.
- `159` card cha sau khi gom các nhóm đã duyệt.
- `6` ảnh bổ sung đã được xác nhận có trên R2.
- Manifest sinh lại còn `0` ảnh thiếu.
- UI mobile hiển thị `2 card / hàng`.

## Các nhóm đã được duyệt để gom

1. Sữa tươi
2. Trà Cozy
3. Bột matcha
4. Đậu hũ phô mai
5. Xúc xích
6. Thanh cua
7. Cốm hồng
8. Sốt bánh gạo
9. Hành phi
10. Bánh tráng
11. Ice Hot
12. Thạch Douxian
13. Topping Hùng Chương
14. Đào lon
15. Bột milk foam
16. Trà đen số 9

Các lựa chọn cụ thể nằm trong:

- `data/catalog/hung-phat/v2/parent-groups-approved-1.json`
- `data/catalog/hung-phat/v2/parent-groups-approved-2.json`
- `data/catalog/hung-phat/v2/parent-groups-approved-3.json`
- `data/catalog/hung-phat/v2/parent-groups-approved-4.json`
- `data/catalog/hung-phat/v2/parent-groups-approved-5.json`

`parent-map-io.mjs` nạp trực tiếp năm file này vào mọi lần build parent map.

## Nhóm còn giữ riêng

- Sương sáo

Lý do: một SKU nguồn đang ghi đồng thời trắng/đen, chưa tạo được hai lựa chọn phân loại rõ và không trùng nhau.

## Sáu ảnh đã bổ sung

- `bgkq-0015`
- `bgkq-0068`
- `bgkq-0108`
- `bgkq-0109`
- `bgkq-0120`
- `bgkq-0276`

Nguồn xác nhận: `data/catalog/hung-phat/v2/resolved-images.json`.

## Kiểm tra bắt buộc

```powershell
cd "F:\1_A_Disk_D\F&B-Order"
pnpm catalog:audit:content:v2
pnpm typecheck
pnpm build:frontend
```

Audit sẽ fail nếu không đạt đúng:

- `159` parent cards;
- `275` variants;
- `0` missing images.

## Phạm vi an toàn

- Không import DB.
- Không migration.
- Không chạy lại importer catalog.
- Không upload lại R2.
- Không deploy VPS.
