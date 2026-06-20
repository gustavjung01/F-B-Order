# Hung Phat Catalog Data Rules

## Mục tiêu

File này chốt cách hiểu dữ liệu catalog Hưng Phát trong app để không đánh nhầm dữ liệu crawl là sai.

## Nguyên tắc nguồn dữ liệu

- Dữ liệu trong `hung-phat-product-catalog-map.md` được xem là dữ liệu crawl chính xác từ nguồn công khai của công ty, đặc biệt Facebook công ty.
- Trường nào có giá trị trong file nguồn thì giữ nguyên theo nguồn, không tự sửa ý nghĩa.
- Trường nào `TODO`, rỗng hoặc `null` nghĩa là **chưa có thông tin trong file nguồn**, không có nghĩa là thông tin còn lại sai.
- Không tự bịa quy cách, giá, tồn kho, barcode, HSD, ảnh SKU hoặc SKU công ty.

## Phân biệt accuracy và completeness

### Source accuracy

`sourceAccuracy` là độ tin cậy của thông tin đã crawl được.

- `company_crawl_confirmed`: thông tin đã có trong file crawl từ nguồn công khai của công ty, xem là chính xác theo nguồn.
- `needs_company_sku_sheet`: cần bảng SKU/bảng giá công ty để bổ sung các trường còn thiếu.

### Data completeness

`dataIssues` chỉ dùng để báo thiếu dữ liệu vận hành app, ví dụ:

- `missing_package_size`
- `missing_unit`
- `missing_price_retail`
- `missing_price_wholesale`
- `missing_image`
- `needs_official_sku`

Các issue này **không phủ nhận độ chính xác của dữ liệu đã có**.

## Quy tắc order

- Sản phẩm thiếu quy cách/đơn vị/giá vẫn có thể hiển thị ở catalog nếu cần.
- Không cho add cart/order tự động khi thiếu dữ liệu bán hàng bắt buộc.
- `isOrderable: false` nghĩa là chưa đủ dữ liệu để đặt hàng, không phải sản phẩm sai.

## Quy tắc quy cách

- `packageSize` chỉ lấy từ `Package/package_size` trong file nguồn.
- Nếu file nguồn thiếu quy cách thì lưu `packageSize: null` và `dataIssues` có `missing_package_size`.
- Không suy luận kiểu "1kg", "1 thùng", "1 gói" nếu file nguồn không ghi.

## Quy tắc SKU

- `id` hiện tại là `productId` nội bộ app.
- SKU công ty/kho chưa có thì để field riêng sau này, không dùng `id` làm SKU kho.
- Khi có bảng công ty, map thêm `sku`, `barcode`, `officialName`, `officialPackageSize`, `priceRetail`, `priceWholesale`.
