# MVP - Bếp Sỉ F&B

MVP là bản tối thiểu để khách có thể đặt hàng thật, admin xử lý được đơn thật, và app có đủ chất riêng để giữ chân khách.

## 1. Mục tiêu MVP

- Khách đăng nhập được.
- Khách xem và tra cứu sản phẩm được.
- Khách thấy đúng giá theo nhóm/khách.
- Khách thêm giỏ và gửi đơn được.
- Admin xem và xử lý đơn được.
- Khách nhận thông báo chương trình/chính sách.
- Có PWA để khách cài ra màn hình chính.
- Có mục Công thức F&B bản đầu để tạo độ happy.

## 2. MVP bắt buộc có

### 2.1 Auth/Login bằng Clerk

- Khách đăng nhập.
- Admin đăng nhập.
- Staff đăng nhập.
- Bảo vệ route khách hàng.
- Bảo vệ route admin.
- Map Clerk user với customer/admin/staff trong database.

Role ban đầu:

- `customer`: khách đặt hàng.
- `admin`: quản trị.
- `staff`: nhân viên xử lý đơn.

### 2.2 Trang chủ khách hàng

- Banner chương trình.
- Nút tìm kiếm sản phẩm.
- Danh mục chính.
- Sản phẩm thường mua.
- Đặt lại đơn gần nhất.
- Công thức nổi bật.
- Nút gọi/Zalo sales phụ trách.
- Nút tải app PWA.

### 2.3 Danh mục sản phẩm

Nhóm trà sữa:

- Trà.
- Bột sữa / kem béo.
- Syrup.
- Sauce / mứt.
- Topping.
- Trân châu.
- Thạch / pudding.
- Ly, nắp, ống hút.

Nhóm mì cay / quán ăn:

- Mì.
- Sốt mì cay.
- Sốt lẩu.
- Viên thả lẩu.
- Đồ đông lạnh.
- Gia vị.
- Bao bì.
- Combo nguyên liệu.

Nhóm bán hàng:

- Hàng mới.
- Hàng bán chạy.
- Hàng khuyến mãi.
- Combo mở quán.
- Sản phẩm thường mua.

### 2.4 Tra cứu sản phẩm

- Tìm theo tên sản phẩm.
- Tìm theo mã SKU.
- Tìm theo tên gọi quen thuộc/alias.
- Lọc theo danh mục.
- Lọc hàng mới/hot/khuyến mãi.

Ví dụ alias cần hỗ trợ:

- `tc đen` → Trân châu đen.
- `bột béo` → Bột sữa / kem béo.
- `ly 700` → Ly 700ml.
- `sốt cay` → Sốt mì cay.

### 2.5 Chi tiết sản phẩm

- Ảnh sản phẩm.
- Tên sản phẩm.
- SKU.
- Quy cách.
- Đơn vị bán.
- Giá theo khách/nhóm khách.
- Tình trạng hàng.
- Mô tả ngắn.
- Cách dùng/bảo quản.
- Sản phẩm liên quan.
- Công thức liên quan.
- Nút thêm vào giỏ.

### 2.6 Giỏ hàng và đặt hàng

- Thêm sản phẩm vào giỏ.
- Tăng/giảm số lượng.
- Xóa sản phẩm.
- Ghi chú đơn hàng.
- Chọn địa chỉ giao.
- Gửi đơn.
- Tạo mã đơn.
- Lưu snapshot giá tại thời điểm đặt.

Trạng thái đơn:

- `pending`: Chờ xác nhận.
- `confirmed`: Đã xác nhận.
- `preparing`: Đang soạn hàng.
- `delivering`: Đang giao.
- `completed`: Hoàn tất.
- `cancelled`: Đã hủy.

### 2.7 Lịch sử đơn hàng

- Danh sách đơn.
- Chi tiết đơn.
- Trạng thái đơn.
- Tổng tiền.
- Sản phẩm trong đơn.
- Ghi chú.
- Nút đặt lại đơn này.

### 2.8 Thông báo chương trình/chính sách

- Trung tâm thông báo trong app.
- Thông báo khuyến mãi.
- Thông báo chính sách giá.
- Thông báo chính sách công nợ.
- Thông báo hàng mới.
- Thông báo công thức mới.
- Thông báo trạng thái đơn.
- Đánh dấu đã đọc.

OneSignal MVP:

- Đăng ký thiết bị/browser.
- Lưu OneSignal subscription/player id.
- Admin gửi thông báo test.
- Gửi theo nhóm khách cơ bản.

### 2.9 Công thức F&B bản đầu

Mục tiêu: giữ chân khách, giúp app không chỉ là nơi đặt hàng.

- Danh sách công thức.
- Chi tiết công thức.
- Ảnh công thức.
- Nguyên liệu.
- Cách làm.
- Cost tham khảo.
- Giá bán gợi ý.
- Sản phẩm liên quan.
- Nút thêm nguyên liệu vào giỏ.

Công thức mẫu nên có:

- Trà sữa truyền thống.
- Sữa tươi trân châu đường đen.
- Trà đào cam sả.
- Matcha latte.
- Mì cay hải sản.
- Mì cay bò.
- Lẩu tokbokki.

### 2.10 PWA chuẩn

- `manifest.webmanifest`.
- `service-worker.js`.
- `pwa-register.js`.
- `pwa-install-button.js`.
- `pwa-update-toast.js`.
- `open-external-browser.js`.
- `app-version.json`.
- Icon 180/192/512/maskable.
- Nút Tải app.
- Hướng dẫn iPhone.
- Hướng dẫn mở ngoài Zalo/Facebook.
- Không cache API.
- Không cache admin.
- Có toast cập nhật bản mới.

### 2.11 Admin tối thiểu

- Admin login bằng Clerk.
- Dashboard ngắn.
- Quản lý sản phẩm.
- Quản lý danh mục.
- Quản lý khách hàng.
- Quản lý nhóm giá.
- Quản lý đơn hàng.
- Cập nhật trạng thái đơn.
- Quản lý banner/chương trình.
- Gửi thông báo.
- Quản lý công thức.

## 3. MVP chưa làm

- Native app Android/iOS.
- Đưa app lên CH Play/App Store.
- Sales App riêng.
- Check-in GPS.
- Google Maps tuyến bán hàng.
- Công nợ nâng cao.
- Tồn kho realtime phức tạp.
- Giao hàng nâng cao.
- Thanh toán online.
- Chat nội bộ.
- AI gợi ý công thức.
- Video công thức.

## 4. Database MVP

Bảng bắt buộc:

- `customers`.
- `customer_users`.
- `categories`.
- `products`.
- `product_images`.
- `product_aliases`.
- `price_groups`.
- `product_prices`.
- `carts`.
- `cart_items`.
- `orders`.
- `order_items`.
- `order_status_logs`.
- `banners`.
- `notifications`.
- `notification_reads`.
- `onesignal_devices`.
- `recipes`.
- `recipe_categories`.
- `recipe_ingredients`.
- `recipe_products`.
- `recipe_steps`.

## 5. API MVP

Customer API:

- `GET /api/health`.
- `GET /api/me`.
- `GET /api/categories`.
- `GET /api/products`.
- `GET /api/products/:id`.
- `GET /api/search?q=`.
- `GET /api/cart`.
- `POST /api/cart/items`.
- `PATCH /api/cart/items/:id`.
- `DELETE /api/cart/items/:id`.
- `POST /api/orders`.
- `GET /api/orders`.
- `GET /api/orders/:id`.
- `POST /api/orders/:id/reorder`.
- `GET /api/notifications`.
- `PATCH /api/notifications/:id/read`.
- `POST /api/onesignal/register`.
- `GET /api/recipes`.
- `GET /api/recipes/:id`.
- `POST /api/recipes/:id/add-to-cart`.

Admin API:

- `GET /api/admin/dashboard`.
- `CRUD /api/admin/products`.
- `CRUD /api/admin/categories`.
- `CRUD /api/admin/customers`.
- `CRUD /api/admin/price-groups`.
- `CRUD /api/admin/orders`.
- `CRUD /api/admin/banners`.
- `CRUD /api/admin/recipes`.
- `POST /api/admin/notifications/send`.

## 6. Điều kiện coi là MVP đạt

- Khách đăng nhập được.
- Khách tìm sản phẩm được.
- Khách thấy đúng giá.
- Khách đặt được đơn.
- Admin thấy đơn mới.
- Admin cập nhật trạng thái đơn.
- Khách xem lại lịch sử đơn.
- Khách đặt lại đơn cũ được.
- PWA cài được ra màn hình chính.
- App có thông báo chương trình/chính sách.
- App có công thức F&B bản đầu.

## 7. Ghi chú để bổ sung sau

Mọi tính năng mới nếu chưa chắc có làm ngay hay không thì thêm vào mục này trước, sau đó mới chuyển lên MVP bắt buộc.

- [ ] Công nợ hiển thị cơ bản cho khách.
- [ ] Tồn kho hiển thị còn/sắp hết/hết.
- [ ] Chính sách riêng theo từng nhóm khách.
- [ ] Gợi ý sản phẩm mua kèm.
- [ ] Combo tự động thêm nhiều sản phẩm vào giỏ.
- [ ] Export đơn cho kho.
- [ ] Zalo OA sau OneSignal.
