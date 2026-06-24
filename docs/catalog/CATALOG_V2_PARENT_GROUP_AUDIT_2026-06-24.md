# Audit gom sản phẩm vào card cha

## Đã áp dụng vào parent map

Các nhóm đã được duyệt để gom theo phân loại:

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

Sáu nhóm mới được duyệt dùng các lựa chọn sau:

- Ice Hot: `Lùn`, `On Top`
- Thạch Douxian: `Hũ`, `Các loại`
- Topping Hùng Chương: `Jelly`, `Thủy tinh`
- Đào lon: `Rhodes`, `Thái`, `Contree`
- Bột milk foam: `Luave`, `Erdoli`, `Muối biển`
- Trà đen số 9: `Douxian`, `Bóng`, `Luave`

Mười sáu nhóm làm số card cha giảm từ 182 xuống 159 nhưng vẫn giữ đủ 275 SKU, giá và lựa chọn phân loại riêng.

Cấu hình áp dụng nằm trong:

- `data/catalog/hung-phat/v2/parent-groups-approved-1.json`
- `data/catalog/hung-phat/v2/parent-groups-approved-2.json`
- `data/catalog/hung-phat/v2/parent-groups-approved-3.json`
- `data/catalog/hung-phat/v2/parent-groups-approved-4.json`
- `data/catalog/hung-phat/v2/parent-groups-approved-5.json`

`parent-map-io.mjs` nạp cả năm file trên cùng `parent-map-fixes.json`, vì vậy mọi lần build parent map đều dùng đúng quyết định đã duyệt.

## Còn giữ lại để xem riêng

- Sương sáo

Sương sáo chưa gom vì một SKU nguồn đang ghi đồng thời trắng/đen, chưa tạo được lựa chọn phân loại rõ và không trùng nhau.
