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

- `products`: hàng vật lý hoặc bundle thật; có thể tiến tới đặt hàng.
- `catalog_suggestions`: card Combo gợi ý trên Trang chủ; không có SKU, giá hay thao tác đặt hàng.
- `recipes`: nội dung Công thức độc lập; hiện chưa public.
- `category_scaffold` không được nhập thành sản phẩm.

Importer hiện tạo:

```txt
16 products
6 catalog_suggestions
```

Mỗi lần nhập lại, script chỉ vô hiệu hóa và đồng bộ các dòng có `source_key = 'hung-phat'`; dữ liệu thủ công hoặc nguồn khác không bị xóa.

## DB bao gồm

- `customers`, `customer_users`, `staff_users`
- `price_groups`
- `categories`, `products`, `catalog_suggestions`
- `product_aliases`, `product_images`, `product_prices`
- `carts`, `cart_items`
- `orders`, `order_items`, `order_status_logs`
- `banners`
- `notifications`, `notification_reads`, `onesignal_devices`
- `recipe_categories`, `recipes`, `recipe_ingredients`, `recipe_products`, `recipe_steps`

## Quy tắc orderable

Sản phẩm chỉ được cho đặt thật khi đủ tối thiểu:

```txt
status = 'active'
is_active = true
is_orderable = true
sku có dữ liệu
unit có dữ liệu
wholesale_price > 0
```

Sản phẩm thiếu dữ liệu vẫn có thể hiện ở catalog nhưng chưa được tạo đơn. `catalog_suggestions` tuyệt đối không được đưa vào giỏ hàng.
