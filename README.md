# Bếp Sỉ F&B

Repo triển khai **Bếp Sỉ F&B**: PWA đặt hàng nguyên liệu F&B cho khách hàng, sau này mở rộng thành Sales App và native app Android/iOS.

## Stack chốt

- **Frontend:** Next.js + Tailwind + PWA, deploy Vercel
- **Backend:** Node.js/NestJS, deploy VPS bằng Docker + Nginx
- **Database:** Heroku Postgres
- **Auth/Login:** Clerk
- **Push notification:** OneSignal
- **Giai đoạn đầu:** PWA chuẩn, có nút tải app, tự update, hỗ trợ mở từ Zalo/Facebook browser

## Mục tiêu MVP

1. Khách đăng nhập và đặt hàng nhanh.
2. Có đủ nhánh sản phẩm F&B.
3. Tra cứu sản phẩm mạnh bằng tên, mã, tên gọi quen thuộc.
4. Khách nhận thông báo chương trình, chính sách, đơn hàng.
5. Có mục Công thức F&B để giữ chân khách.
6. Admin quản lý được sản phẩm, khách, giá, đơn, thông báo, công thức.

## Tài liệu triển khai

- `docs/MVP.md`: phạm vi MVP để sửa/bổ sung khi cần.
- `docs/FEATURES.md`: tính năng ngắn gọn theo module.
- `docs/EXECUTION_PLAN.md`: plan thực thi theo phase.
- `docs/REPO_STRUCTURE.md`: cấu trúc repo sẽ làm theo.

## Nguyên tắc triển khai

- Frontend không kết nối trực tiếp database.
- Backend giữ toàn bộ logic giá, đơn, quyền, thông báo.
- Clerk quản lý đăng nhập và user identity.
- Database nội bộ vẫn lưu `customer_id`, `role`, `price_group`, `sales_owner` để xử lý nghiệp vụ.
- PWA phải làm từ đầu, không để cuối mới vá.
