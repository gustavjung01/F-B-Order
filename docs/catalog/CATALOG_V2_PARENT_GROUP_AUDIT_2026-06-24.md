# Audit gom sản phẩm vào card cha

## Đã áp dụng vào parent map

Các nhóm đã đủ rõ để gom theo phân loại:

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

Mười nhóm này gom 23 SKU thành 10 card cha, giảm số card dự kiến từ 182 xuống 168 nhưng vẫn giữ đủ 275 SKU và toàn bộ giá/phân loại riêng.

Cấu hình áp dụng nằm trong:

- `data/catalog/hung-phat/v2/parent-groups-approved-1.json`
- `data/catalog/hung-phat/v2/parent-groups-approved-2.json`
- `data/catalog/hung-phat/v2/parent-groups-approved-3.json`
- `data/catalog/hung-phat/v2/parent-groups-approved-4.json`

`parent-map-io.mjs` nạp bốn file trên cùng `parent-map-fixes.json`, vì vậy mọi lần build parent map đều dùng cùng quyết định đã duyệt.

## Phải xem lại ảnh và tên trước khi gom

- Ice Hot
- Thạch Douxian
- Topping Hùng Chương
- Đào lon
- Bột milk foam
- Trà đen số 9
- Sương sáo

Không gom tự động các nhóm này để tránh trộn sai sản phẩm hoặc biến thương hiệu khác nhau thành cùng một phân loại khi tên nguồn chưa đủ rõ.
