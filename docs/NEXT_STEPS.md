# NEXT STEPS - Bếp Sỉ F&B

Việc cần làm tiếp trên repo, theo đúng thứ tự. Không nhảy cóc.

## 1. Đồng bộ local

Mục tiêu: máy local có đúng code mới nhất từ GitHub.

```powershell
cd "F:\1_A_Disk_D\F&B-Order"
git pull origin main
pnpm install
```

Chưa cần set VPS, Heroku, Vercel lúc này.

## 2. Kiểm tra skeleton chạy được

Frontend:

```powershell
pnpm --filter @fb-order/frontend dev
```

Backend:

```powershell
pnpm --filter @fb-order/backend dev
```

Backend health check:

```powershell
curl http://localhost:4000/api/health
```

## 3. Sửa các lỗi nền nếu có

Ưu tiên sửa ngay nếu gặp:

- `pnpm install` lỗi.
- Frontend không chạy.
- Backend không chạy.
- TypeScript lỗi.
- Tailwind/Next config lỗi.
- PWA script gây lỗi browser console.

Chưa làm tính năng khi skeleton chưa chạy ổn.

## 4. Làm Clerk login

Mục tiêu: có đăng nhập trước khi làm dữ liệu khách.

Việc cần làm:

- Cài Clerk provider trong frontend.
- Tạo trang sign-in/sign-up.
- Bảo vệ route account/orders/admin.
- Backend xác thực Clerk token.
- Tạo bảng mapping `customer_users`.

Role ban đầu:

- `customer`.
- `admin`.
- `staff`.

## 5. Làm Product API

Mục tiêu: frontend lấy được danh mục và sản phẩm từ backend.

API cần có:

- `GET /api/categories`.
- `GET /api/products`.
- `GET /api/products/:id`.
- `GET /api/search?q=`.

Logic bắt buộc:

- Chỉ trả sản phẩm active.
- Có tìm kiếm theo tên, SKU, alias.
- Có giá theo nhóm khách.

## 6. Làm giao diện sản phẩm

Màn cần làm:

- Danh mục sản phẩm.
- Danh sách sản phẩm.
- Tìm kiếm.
- Chi tiết sản phẩm.

Nhánh chính:

- Trà sữa.
- Mì cay / quán ăn.
- Hàng mới.
- Hàng bán chạy.
- Hàng khuyến mãi.
- Combo.

## 7. Làm giỏ hàng và đơn hàng

API:

- `GET /api/cart`.
- `POST /api/cart/items`.
- `PATCH /api/cart/items/:id`.
- `DELETE /api/cart/items/:id`.
- `POST /api/orders`.
- `GET /api/orders`.
- `GET /api/orders/:id`.
- `POST /api/orders/:id/reorder`.

Màn:

- Giỏ hàng.
- Checkout.
- Lịch sử đơn.
- Chi tiết đơn.
- Đặt lại đơn cũ.

## 8. Làm admin tối thiểu

Mục tiêu: có người vận hành được đơn thật.

Màn cần làm:

- Admin dashboard.
- Quản lý sản phẩm.
- Quản lý danh mục.
- Quản lý khách.
- Quản lý nhóm giá.
- Quản lý đơn.

## 9. Hoàn thiện PWA

Hiện repo đã có PWA nền. Cần bổ sung sau khi có logo:

- `apple-touch-icon.png`.
- `icon-192.png`.
- `icon-512.png`.
- `maskable-512.png`.

Sau đó test:

- Android Chrome.
- iPhone Safari.
- Mở link từ Zalo/Facebook.
- Update app-version.

## 10. OneSignal

Làm sau khi frontend/backend ổn.

Việc cần làm:

- Cài OneSignal frontend.
- API register device.
- Lưu subscription/player id.
- Admin gửi thông báo.
- Trung tâm thông báo trong app.

Loại thông báo:

- Chương trình.
- Chính sách.
- Hàng mới.
- Trạng thái đơn.
- Công thức mới.

## 11. Công thức F&B

Mục tiêu: giữ chân khách.

Màn:

- Danh sách công thức.
- Chi tiết công thức.
- Công thức liên quan đến sản phẩm.

Tính năng quan trọng:

- Từ công thức thêm nguyên liệu vào giỏ.
- Từ sản phẩm xem công thức liên quan.

## Thứ tự ưu tiên ngắn

1. Pull repo về local.
2. Chạy skeleton.
3. Fix lỗi nền.
4. Clerk login.
5. Product API.
6. Product UI.
7. Cart/order.
8. Admin tối thiểu.
9. PWA icon/test.
10. OneSignal.
11. Công thức F&B.
