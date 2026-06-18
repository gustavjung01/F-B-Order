# Bếp Sỉ F&B MVP order/backend contract

Mục tiêu của tài liệu này là giữ contract rõ để sau này tách backend riêng khỏi Next API mà không vỡ luồng đặt hàng.

## PWA scopes

- Customer PWA
  - Manifest: `/manifest.webmanifest`
  - Start URL: `/`
  - Scope: `/`
  - Không hiển thị link admin ở public navigation.

- Admin PWA
  - Manifest: `/admin-manifest.webmanifest`
  - Start URL: `/admin/orders`
  - Scope: `/admin/`
  - Layout riêng: `app/admin/layout.tsx`
  - Auth guard: `ADMIN_EMAILS` qua `getAdminAccess()` / `requireAdmin()`

## Customer order APIs

### `GET /api/orders`

Purpose: khách xem lịch sử đơn của chính mình.

Auth:
- Clerk user bắt buộc.
- Lookup `customers` bằng `clerk_user_id`.
- Chỉ trả orders có `orders.customer_id = customers.id`.

Response shape:

```json
{
  "orders": [
    {
      "id": "uuid",
      "orderCode": "BSI-...",
      "status": "submitted",
      "subtotal": 100000,
      "note": "",
      "submittedAt": "timestamp",
      "confirmedAt": null,
      "items": [
        {
          "id": "uuid",
          "sku": "SKU",
          "name": "Tên sản phẩm",
          "unit": "Gói 1kg",
          "quantity": 1,
          "unitPrice": 100000,
          "lineTotal": 100000
        }
      ]
    }
  ],
  "profileRequired": false
}
```

### `POST /api/orders`

Purpose: tạo đơn thật từ cart local/client.

Auth:
- Clerk user bắt buộc.
- Customer profile bắt buộc.
- `customers.approval_status` phải là `approved`.

Request shape:

```json
{
  "note": "Giao buổi sáng",
  "items": [
    { "productId": "uuid", "quantity": 2 }
  ]
}
```

Server rules:
- Không tin giá client/localStorage.
- Product id phải là UUID hợp lệ.
- Gộp trùng productId.
- Query lại `products` trong DB.
- Chỉ nhận `products.status = 'active'`.
- Lấy `products.wholesale_price` làm `unit_price`.
- Check `quantity >= products.min_order_qty`.
- Insert transaction:
  - `orders`
  - `order_items`

Main errors:
- `UNAUTHENTICATED`
- `CUSTOMER_PROFILE_REQUIRED`
- `CUSTOMER_NOT_APPROVED`
- `EMPTY_ORDER`
- `TOO_MANY_ITEMS`
- `PRODUCT_NOT_FOUND_OR_INACTIVE`
- `QUANTITY_BELOW_MIN`
- `CREATE_ORDER_FAILED`

## Admin order APIs

### `GET /api/admin/orders`

Purpose: admin xem đơn và chi tiết sản phẩm.

Auth:
- `requireAdmin()` bắt buộc.
- Email phải nằm trong `ADMIN_EMAILS`.

Response shape:

```json
{
  "orders": [
    {
      "id": "uuid",
      "orderCode": "BSI-...",
      "status": "submitted",
      "subtotal": 100000,
      "note": "",
      "submittedAt": "timestamp",
      "confirmedAt": null,
      "customer": {
        "shopName": "Tên quán",
        "contactName": "Tên người liên hệ",
        "phone": "090...",
        "address": "Địa chỉ"
      },
      "items": []
    }
  ]
}
```

### `PATCH /api/admin/orders`

Purpose: admin cập nhật trạng thái đơn.

Request shape:

```json
{
  "orderId": "uuid",
  "status": "confirmed"
}
```

Allowed transitions:

```text
submitted -> confirmed | cancelled
confirmed -> fulfilled | cancelled
fulfilled -> terminal
cancelled -> terminal
```

The API returns `INVALID_STATUS_TRANSITION` with HTTP 409 for invalid transitions.

## VPS backend skeleton

Current reserved VPS backend tree:

```text
/srv/apps/bepsi
├── source
├── current -> /srv/apps/bepsi/source
├── releases
└── shared
    ├── logs
    ├── tmp
    └── uploads
```

Runtime env file:

```text
/etc/app-env/bepsi.env
```

Reserved backend port:

```text
5100
```

Health endpoints for systemd/nginx verification:

```text
GET /health
GET /api/health
```

Live API base:

```text
https://api.bepsi.click
```

Do not touch existing VPS apps:

```text
/srv/apps/vlgn
/srv/apps/tocviet
```

## Backend riêng sau này

Khi tách backend riêng, giữ nguyên API contract phía frontend:

- `GET /api/products`
- `GET /api/orders`
- `POST /api/orders`
- `GET /api/admin/orders`
- `PATCH /api/admin/orders`
- `GET /api/admin/customers`
- `PATCH /api/admin/customers`

Next API route có thể chuyển thành proxy sang backend riêng mà không đổi UI.

Backend riêng cần thêm sau MVP:

- Role/permission chi tiết hơn `ADMIN_EMAILS`.
- Push notification server side khi order status đổi.
- Audit log cho admin action.
- Inventory/price sync.
- Long running AI recipe jobs.
- Payment/shipping webhook nếu có.

## Deploy marker

Production domain/API deploy trigger created for `bepsi.click` and `api.bepsi.click`.
