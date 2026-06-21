# DB - Bếp Sỉ F&B

Nguồn schema chuẩn hiện tại:

```bash
pnpm db:migrate
```

Nhập catalog Hưng Phát sau khi migrate:

```bash
pnpm catalog:import
```

Seed kiểm thử local/dev:

```bash
pnpm db:seed:test
```

Không cần cài `psql`. Các script đọc `DATABASE_URL` hoặc `BEPSI_DATABASE_URL` từ môi trường, `./.env`, `apps/backend/.env`, hoặc `apps/backend/.env.local`.

## Ranh giới dữ liệu catalog

- `products.product_type = physical`: sản phẩm lẻ.
- `products.product_type = bundle`: combo bán hàng, đặt như một sản phẩm bình thường.
- `product_bundle_items`: danh sách sản phẩm con và số lượng nằm trong từng combo.
- `recipes`: nội dung hướng dẫn/công thức độc lập; hiện chưa public.
- `category_scaffold`: khung danh mục, không được nhập thành sản phẩm.

Importer hiện tạo:

```txt
16 sản phẩm lẻ
6 sản phẩm bundle
22 sản phẩm public
7 category scaffold bị loại
```

`Combo gợi ý` chỉ là tên tab lọc trên Trang chủ. Sáu combo vẫn nằm trong `products`, có trang chi tiết và cùng luồng giỏ hàng/đơn hàng với sản phẩm lẻ.

Mỗi lần nhập lại, script chỉ vô hiệu hóa và đồng bộ các dòng có `source_key = 'hung-phat'`; dữ liệu thủ công hoặc nguồn khác không bị xóa. SKU, giá và cấu hình orderable đã được nhập thủ công sẽ được giữ lại.

## DB bao gồm

- `customers`, `customer_users`, `staff_users`
- `price_groups`
- `categories`, `products`, `product_bundle_items`
- `product_aliases`, `product_images`, `product_prices`
- `carts`, `cart_items`
- `orders`, `order_items`, `order_status_logs`
- `banners`
- `notifications`, `notification_reads`, `onesignal_devices`
- `recipe_categories`, `recipes`, `recipe_ingredients`, `recipe_products`, `recipe_steps`

## Quy tắc orderable

Sản phẩm lẻ chỉ được đặt thật khi đủ:

```txt
status = 'active'
is_active = true
is_public = true
is_orderable = true
sku có dữ liệu
unit có dữ liệu
wholesale_price > 0
```

Bundle dùng cùng điều kiện và phải có ít nhất một dòng trong `product_bundle_items`. Thiếu thành phần hoặc giá thì bundle vẫn hiện trong catalog nhưng chưa mở nút đặt hàng; không được tạo đơn giá 0 hoặc combo rỗng.
