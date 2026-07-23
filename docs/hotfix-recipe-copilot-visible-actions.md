# Recipe Copilot visible actions hotfix

Branch này sửa lỗi thanh hành động Recipe Copilot chỉ xuất hiện khi tab Các bước được render.

Phạm vi sửa:
- Hiển thị Recipe Copilot ngay khi mở editor công thức, không phụ thuộc tab.
- Không ẩn im lặng khi tài khoản thiếu quyền AI; giao diện phải báo rõ quyền còn thiếu.
- Giữ nguyên luồng human review, versioning và media safety.

Target branch: `main`
