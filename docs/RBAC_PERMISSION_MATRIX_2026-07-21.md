# RBAC permission matrix — 2026-07-21

## Mục tiêu

RBAC thay thế kiểm tra cứng `admin/staff` bằng quyền theo hành động. Một nhân viên có thể được gán nhiều role; quyền hiệu lực là hợp của toàn bộ role đang hoạt động.

Trong giai đoạn chuyển đổi, cột `staff_users.role` vẫn được giữ để backend cũ tiếp tục hoạt động. Nguồn quyền mới là các bảng `rbac_*` và `staff_role_assignments`.

## Permission catalog

| Module | Permission | Ý nghĩa | Risk |
|---|---|---|---|
| Orders | `orders.view` | Xem đơn hàng | low |
| Orders | `orders.update` | Cập nhật trạng thái và thông tin vận hành đơn | high |
| Orders | `orders.internal_notes` | Xem và sửa ghi chú nội bộ | medium |
| Customers | `customers.view` | Xem hồ sơ khách hàng | medium |
| Customers | `customers.update` | Cập nhật hồ sơ và trạng thái duyệt | high |
| Catalog | `catalog.view` | Xem Catalog quản trị | low |
| Catalog | `catalog.edit` | Tạo và sửa sản phẩm, variant, quy cách | high |
| Catalog | `catalog.publish` | Cho phép public/orderable và thay đổi trạng thái phát hành | critical |
| Catalog | `catalog.pricing` | Sửa giá bán và giá sỉ | critical |
| Recipes | `recipes.view` | Xem công thức quản trị và internal | medium |
| Recipes | `recipes.edit` | Tạo và sửa draft công thức | high |
| Recipes | `recipes.review` | Duyệt hoặc từ chối version công thức | high |
| Recipes | `recipes.publish` | Publish hoặc unpublish công thức | critical |
| Recipes | `recipes.media.manage` | Upload, thay thế, xóa media công thức | high |
| Staff | `staff.view` | Xem danh sách nhân viên và role | high |
| Staff | `staff.manage` | Tạo, khóa, kích hoạt nhân viên | critical |
| Staff | `staff.roles.assign` | Gán hoặc thu hồi role | critical |
| Audit | `audit.view` | Xem audit log | high |
| AI | `ai.use` | Dùng AI ở chế độ hỏi đáp/read-only | medium |
| AI | `ai.execute` | Cho AI tạo draft hoặc gọi action có kiểm soát | high |
| AI | `ai.configure` | Cấu hình model, prompt, tool và policy | critical |
| AI | `ai.audit` | Xem lịch sử prompt, tool call và kết quả AI | high |

## System roles

| Role | Mục đích |
|---|---|
| `super_admin` | Toàn quyền hệ thống |
| `operations` | Vận hành đơn hàng và khách hàng |
| `catalog_manager` | Quản lý Catalog, giá và trạng thái phát hành |
| `recipe_editor` | Soạn draft công thức và quản lý media |
| `recipe_publisher` | Review và publish công thức |
| `support` | Hỗ trợ khách hàng và tra cứu đơn |
| `ai_operator` | Dùng AI read-only và tạo draft/action được cho phép |
| `auditor` | Chỉ đọc dữ liệu quản trị và audit log |

## Matrix mặc định

| Permission | super_admin | operations | catalog_manager | recipe_editor | recipe_publisher | support | ai_operator | auditor |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| `orders.view` | ✓ | ✓ |  |  |  | ✓ | ✓ | ✓ |
| `orders.update` | ✓ | ✓ |  |  |  |  |  |  |
| `orders.internal_notes` | ✓ | ✓ |  |  |  | ✓ |  | ✓ |
| `customers.view` | ✓ | ✓ |  |  |  | ✓ | ✓ | ✓ |
| `customers.update` | ✓ | ✓ |  |  |  | ✓ |  |  |
| `catalog.view` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `catalog.edit` | ✓ |  | ✓ |  |  |  |  |  |
| `catalog.publish` | ✓ |  | ✓ |  |  |  |  |  |
| `catalog.pricing` | ✓ |  | ✓ |  |  |  |  |  |
| `recipes.view` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `recipes.edit` | ✓ |  |  | ✓ |  |  |  |  |
| `recipes.review` | ✓ |  |  |  | ✓ |  |  |  |
| `recipes.publish` | ✓ |  |  |  | ✓ |  |  |  |
| `recipes.media.manage` | ✓ |  |  | ✓ |  |  |  |  |
| `staff.view` | ✓ |  |  |  |  |  |  | ✓ |
| `staff.manage` | ✓ |  |  |  |  |  |  |  |
| `staff.roles.assign` | ✓ |  |  |  |  |  |  |  |
| `audit.view` | ✓ |  |  |  |  |  |  | ✓ |
| `ai.use` | ✓ |  |  | ✓ | ✓ | ✓ | ✓ |  |
| `ai.execute` | ✓ |  |  |  |  |  | ✓ |  |
| `ai.configure` | ✓ |  |  |  |  |  |  |  |
| `ai.audit` | ✓ |  |  |  |  |  |  | ✓ |

## Quy tắc bắt buộc

1. Frontend chỉ dùng permission để ẩn menu và nút; backend luôn kiểm tra quyền thật.
2. `super_admin` là role hệ thống, không được sửa key hoặc xóa.
3. Chỉ người có `staff.roles.assign` được gán hoặc thu hồi role.
4. Không người dùng nào được tự gán role cho chính mình nếu hành động làm tăng quyền.
5. Mọi thay đổi role phải ghi append-only log gồm actor, target, role, action, lý do, request ID và IP.
6. Permission `critical` phải được kiểm tra trực tiếp tại endpoint thực thi, không chỉ ở router cha.
7. AI không nhận quyền riêng; AI chỉ hành động trong permission của người gọi và policy của tool.

## Backfill migration

- `staff_users.role = 'admin'` → gán `super_admin`.
- `staff_users.role = 'staff'` → gán `operations`.
- Không xóa hoặc đổi cột legacy trong migration nền tảng này.
