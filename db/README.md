# DB - Bếp Sỉ F&B

Nguồn schema chuẩn hiện tại:

```bash
psql "$DATABASE_URL" -f db/migrations/001_init_core.sql
```

Seed kiểm thử local/dev:

```bash
psql "$DATABASE_URL" -f db/seeds/001_seed_test.sql
```

Lưu ý:

- `001_seed_test.sql` chỉ tạo dữ liệu DEV TEST để kiểm tra schema/order flow.
- Không dùng dữ liệu DEV TEST làm catalog bán thật.
- Product thật chỉ chuyển `active` khi có nguồn dữ liệu đủ tin cậy.

## DB v1 bao gồm

- `customers`, `customer_users`, `staff_users`
- `price_groups`
- `categories`, `products`, `product_aliases`, `product_images`, `product_prices`
- `carts`, `cart_items`
- `orders`, `order_items`, `order_status_logs`
- `banners`
- `notifications`, `notification_reads`, `onesignal_devices`
- `recipe_categories`, `recipes`, `recipe_ingredients`, `recipe_products`, `recipe_steps`

## Quy tắc orderable bản đầu

Sản phẩm chỉ được cho đặt thật khi đủ tối thiểu:

```txt
status = 'active'
is_active = true
sku có dữ liệu
unit có dữ liệu
wholesale_price > 0
```

Sản phẩm thiếu dữ liệu vẫn có thể hiện ở catalog với trạng thái/audit, nhưng chưa cho tạo đơn thật.
