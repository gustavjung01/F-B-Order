# EXECUTION PLAN - Bếp Sỉ F&B

Plan này dùng để bám triển khai trong repo. Làm theo phase, không nhảy tính năng.

## Phase 0 - Nền repo

Mục tiêu: dựng khung dự án sạch.

Việc cần làm:

- Tạo monorepo.
- Tạo `apps/frontend`.
- Tạo `apps/backend`.
- Tạo `db/migrations`.
- Tạo `packages/shared`.
- Tạo `.env.example` cho frontend/backend.
- Cài lint/format cơ bản.
- Viết README chạy local.

Kết quả cần có:

- Chạy được frontend local.
- Chạy được backend local.
- Có health check backend.

## Phase 1 - Auth Clerk

Mục tiêu: đăng nhập và phân quyền trước khi làm nghiệp vụ.

Việc cần làm:

- Cài Clerk cho frontend Next.js.
- Cài Clerk middleware cho backend.
- Tạo route đăng nhập/đăng xuất.
- Tạo bảng mapping user nội bộ.
- Map Clerk user với customer/admin/staff.
- Bảo vệ route `/account`, `/orders`, `/admin`.

Role ban đầu:

- `customer`: khách đặt hàng.
- `admin`: quản trị.
- `staff`: nhân viên xử lý đơn.

Lưu ý:

- Clerk quản lý identity.
- Database vẫn lưu hồ sơ khách, nhóm giá, sales phụ trách.
- Không nhét logic giá vào Clerk.

## Phase 2 - Database Heroku Postgres

Mục tiêu: có schema chính để bắt đầu order.

Bảng cần tạo trước:

- `customers`.
- `customer_users`.
- `categories`.
- `products`.
- `product_aliases`.
- `price_groups`.
- `product_prices`.
- `carts`.
- `cart_items`.
- `orders`.
- `order_items`.
- `order_status_logs`.

Kết quả cần có:

- Backend connect được Heroku Postgres.
- Có migration chạy được.
- Có seed data mẫu trà sữa/mì cay.

## Phase 3 - Product API

Mục tiêu: frontend lấy được danh mục và sản phẩm.

API cần có:

- `GET /api/categories`.
- `GET /api/products`.
- `GET /api/products/:id`.
- `GET /api/search?q=`.
- `GET /api/products/:id/related`.

Logic bắt buộc:

- Chỉ trả sản phẩm active.
- Trả giá theo customer/price group.
- Tìm được bằng SKU, tên, alias.

## Phase 4 - Customer frontend

Mục tiêu: khách xem hàng và đặt hàng được.

Màn cần làm:

- Home.
- Product list.
- Product detail.
- Search.
- Cart.
- Checkout.
- Orders.
- Order detail.
- Account.

Tính năng cần xong:

- Xem banner.
- Xem danh mục.
- Tìm sản phẩm.
- Thêm giỏ hàng.
- Gửi đơn.
- Xem lịch sử đơn.
- Đặt lại đơn cũ.

## Phase 5 - Admin tối thiểu

Mục tiêu: vận hành được đơn hàng thật.

Màn cần làm:

- Admin dashboard.
- Products admin.
- Categories admin.
- Customers admin.
- Price groups admin.
- Orders admin.

Tính năng cần xong:

- Thêm/sửa sản phẩm.
- Thêm/sửa danh mục.
- Tạo khách hàng.
- Gán khách vào nhóm giá.
- Xem đơn mới.
- Cập nhật trạng thái đơn.

## Phase 6 - PWA chuẩn

Mục tiêu: khách cài được app ra màn hình chính và app tự update.

File cần có trong frontend public:

- `manifest.webmanifest`.
- `service-worker.js`.
- `pwa-register.js`.
- `pwa-install-button.js`.
- `pwa-update-toast.js`.
- `open-external-browser.js`.
- `app-version.json`.
- `icons/icon-192.png`.
- `icons/icon-512.png`.
- `icons/maskable-512.png`.
- `icons/apple-touch-icon.png`.

Yêu cầu:

- Không cache API.
- Không cache admin.
- HTML dùng network-first.
- Asset dùng cache-first.
- Có nút Tải app.
- Có hướng dẫn iPhone.
- Có cảnh báo khi mở trong Zalo/Facebook browser.
- Có update toast khi có bản mới.

## Phase 7 - OneSignal

Mục tiêu: gửi thông báo chương trình, chính sách và đơn hàng.

Việc cần làm:

- Cài OneSignal Web SDK ở frontend.
- Tạo API register device.
- Lưu OneSignal player/subscription id.
- Tạo notification center trong app.
- Admin gửi thông báo.
- Gửi theo nhóm khách/khu vực/ngành hàng.

Thông báo ban đầu:

- Chương trình khuyến mãi.
- Chính sách giá.
- Hàng mới.
- Công thức mới.
- Trạng thái đơn hàng.

## Phase 8 - Công thức F&B

Mục tiêu: tăng độ happy và giữ chân khách.

Bảng cần thêm:

- `recipes`.
- `recipe_categories`.
- `recipe_ingredients`.
- `recipe_products`.
- `recipe_steps`.
- `recipe_tags`.

Màn cần làm:

- Recipe list.
- Recipe detail.
- Admin recipe CRUD.

Tính năng quan trọng:

- Công thức gắn sản phẩm.
- Từ công thức thêm nguyên liệu vào giỏ.
- Từ sản phẩm xem công thức liên quan.

## Phase 9 - Chuẩn bị native app sau này

Chưa làm ngay, chỉ chuẩn bị đường.

- API tách rõ frontend/backend.
- OneSignal dùng được tiếp cho native.
- Auth không phụ thuộc PWA.
- Không hardcode domain.
- Design mobile-first.

## Thứ tự ưu tiên ngắn

1. Repo nền.
2. Clerk login.
3. DB schema.
4. Product + search.
5. Cart + order.
6. Admin order.
7. PWA.
8. OneSignal.
9. Công thức F&B.
