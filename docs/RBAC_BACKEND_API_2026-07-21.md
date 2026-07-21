# RBAC backend API — 2026-07-21

## Permission guard

`requirePermission(identity, permissionKey)` đọc quyền hiệu lực từ view `staff_effective_permissions`.

Trong giai đoạn chuyển đổi trước migration 021, tài khoản legacy `admin` được fallback toàn quyền để tránh khóa hệ thống. Tài khoản legacy `staff` không được fallback quyền.

`GET /api/auth/me` trả thêm mảng `permissions` cho staff để frontend dùng khi hiển thị menu và hành động.

## Existing admin routes

- Customers read: `customers.view`
- Customers update: `customers.update`
- Orders read: `orders.view`
- Order status update: `orders.update`
- Order internal note: `orders.internal_notes`
- Catalog read: `catalog.view`
- Catalog content update: `catalog.edit`
- Catalog price update: `catalog.pricing`
- Catalog publish/status update: `catalog.publish`
- Recipe read/scale/version: `recipes.view`
- Recipe create/update/archive/submit: `recipes.edit`
- Recipe review: `recipes.review`
- Recipe publish: `recipes.publish`
- Recipe media mutations: `recipes.media.manage`

## Staff and role API

Base path: `/api/admin/staff`

| Method | Path | Permission | Chức năng |
|---|---|---|---|
| GET | `/` | `staff.view` | Danh sách staff và role đang hoạt động |
| GET | `/:staffId` | `staff.view` | Chi tiết, quyền hiệu lực và 100 log role gần nhất |
| POST | `/` | `staff.manage`; thêm `staff.roles.assign` nếu có role | Tạo hồ sơ staff |
| PATCH | `/:staffId` | `staff.manage` | Đổi tên, bật/tắt tài khoản |
| GET | `/roles` | `staff.view` | Danh sách role và permission |
| GET | `/permissions` | `staff.view` | Permission catalog |
| PUT | `/:staffId/roles/:roleKey` | `staff.roles.assign` | Gán hoặc khôi phục role |
| DELETE | `/:staffId/roles/:roleKey` | `staff.roles.assign` | Thu hồi role |

## Safety rules

- Không cho staff tự gán role cho chính mình.
- Không cho staff tự thu hồi role của chính mình.
- Không cho staff tự vô hiệu hóa tài khoản của chính mình.
- Không cho thu hồi `super_admin` cuối cùng còn hoạt động.
- Tạo staff kèm role yêu cầu cả `staff.manage` và `staff.roles.assign`.
- Mọi gán/thu hồi role ghi append-only log gồm actor, lý do, request ID và IP.
