# Pricing Model v2

## Mục tiêu

Catalog hỗ trợ ba lớp giá độc lập:

1. `retailPrice`: giá lẻ công khai cho khách chưa mở tài khoản quán.
2. `shopPrice`: giá quán cho khách đã được duyệt.
3. `priceGroupPrice`: giá riêng theo nhóm khách, ưu tiên cao nhất.

## Chế độ giá

### Fixed

```json
{
  "priceMode": "fixed",
  "retailPrice": 120000,
  "shopPrice": 100000,
  "priceStatus": "ready"
}
```

Quy tắc hiển thị:

- Anonymous, tài khoản chưa duyệt: xem `retailPrice`.
- Quán đã duyệt: xem `priceGroupPrice`, nếu không có thì `shopPrice`, cuối cùng mới dùng `retailPrice`.

### Market

```json
{
  "priceMode": "market",
  "priceLabel": "Thời giá",
  "retailPrice": null,
  "shopPrice": null,
  "priceStatus": "market",
  "isOrderable": false
}
```

Khi chưa có giá hiện hành:

- UI hiển thị `Thời giá`.
- Không tự gán giá 0.
- Không cho thêm vào giỏ.
- Admin có bộ lọc `Thời giá / Chưa có giá hiện hành` để cập nhật thủ công.

Khi admin nhập giá hiện hành:

- Có thể nhập riêng `retailPrice` và `shopPrice`.
- Ghi thời điểm hiệu lực và người cập nhật.
- Sản phẩm được phép đặt hàng khi giá hợp lệ.

## Thứ tự chọn giá

### Khách chưa được duyệt

```text
retailPrice
```

### Quán đã được duyệt

```text
priceGroupPrice -> shopPrice -> retailPrice
```

## Ràng buộc

- `retailPrice >= shopPrice` khi cả hai cùng tồn tại.
- Không dùng `0` để biểu diễn thời giá.
- `null + priceMode=market` mới là thời giá hợp lệ.
- Mọi thay đổi giá từ admin phải có audit log.
- Giá dùng trong đơn hàng phải được snapshot vào order item, không đọc lại giá hiện tại sau khi đặt.

## Trạng thái triển khai

- Phase 4 R2 đã hỗ trợ `fixed` và `market` trong manifest.
- Ba SKU rau tươi hiện được đánh dấu `market` trong `data/catalog/hung-phat/v2/price-policies.csv`.
- Admin filter, lịch sử giá và hiển thị giá lẻ công khai được triển khai ở phase backend/admin sau khi catalog R2 hoàn tất.
