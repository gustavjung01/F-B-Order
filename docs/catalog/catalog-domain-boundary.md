# Catalog domain boundary

Đây là quy tắc nghiệp vụ chuẩn của Bếp Sỉ.

## Products

Mọi mặt hàng có thể bán đều nằm trong `products`.

- `product_type = physical`: sản phẩm lẻ.
- `product_type = bundle`: combo gồm nhiều sản phẩm con.
- `catalog_kind = sku_candidate`: sản phẩm lẻ đang hoàn thiện dữ liệu.
- `catalog_kind = bundle_candidate`: combo đang hoàn thiện SKU, giá hoặc thành phần.

Sáu mục trong tab **Combo gợi ý** là bundle products, không phải recipe content và không phải nội dung marketing.

## Bundle items

`product_bundle_items` xác định cấu trúc combo:

```text
bundle_product_id
component_product_id
quantity
unit
sort_order
```

Khách thêm một bundle vào giỏ như một sản phẩm bình thường. Hệ thống giữ bundle ở `cart_items` và `order_items`; thành phần con dùng cho kiểm tra cấu hình, chuẩn bị hàng và tồn kho.

Bundle chỉ mở đặt hàng khi có SKU, đơn vị bán, giá hợp lệ, `is_orderable = true` và ít nhất một thành phần con.

## Recipes

`recipes` chỉ dành cho hướng dẫn chế biến, định lượng và nội dung hỗ trợ khách hàng. Recipes là nhánh độc lập và hiện chưa public.

## Homepage filters

`Combo gợi ý` chỉ là nhãn tab lọc category `combo-cong-thuc`. Tab này đọc cùng API `/api/catalog/products` như các tab sản phẩm khác.

## Import result

```text
16 physical products
6 bundle products
22 public products
7 category scaffolds excluded
```

Các nhãn `recipe_content` cũ trong tài liệu crawl là dữ liệu nghiên cứu legacy. Normalizer và importer bắt buộc chuyển toàn bộ sáu dòng của bảng combo thành `product_type = bundle` và `catalog_kind = bundle_candidate`.
