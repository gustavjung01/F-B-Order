# Bếp Sỉ Admin Design System

Đây là lớp giao diện duy nhất cho các module admin.

## Phạm vi

- `AdminShell` quản lý sidebar desktop, top bar mobile, tài khoản và thông báo.
- `AdminUI.tsx` quản lý surface, toolbar, form control, button, badge, alert, empty state, stat card, dialog, tabs và toast.
- `AdminToggle.tsx` quản lý checkbox vận hành có nhãn.
- Module chỉ giữ state và nghiệp vụ của chính nó. Module không tự tạo một hệ button, input, dialog hoặc toast khác.

## Quy tắc bắt buộc

1. Mọi trang trong `app/admin` dùng `AdminShell`.
2. Dialog dùng `AdminDialog`; không lặp lại overlay `fixed inset-0` trong từng module.
3. Form dùng `AdminField` cùng `AdminInput`, `AdminSelect` hoặc `AdminTextarea`.
4. Hành động dùng `AdminButton` với tone có nghĩa nghiệp vụ.
5. Trạng thái dùng `AdminBadge` hoặc `AdminAlert`.
6. Không thêm CSS theo selector DOM sâu hoặc CSS riêng cho một trang admin.
7. Không dùng design-system refactor để mở thêm nghiệp vụ. Scope công thức đang khóa ở ổn định UI, workflow và vòng đời media R2.

## Button tone

- `primary`: hành động chính của module.
- `dark`: thao tác trung tính có trọng lượng cao.
- `success`: duyệt, hoàn thành hoặc xuất bản.
- `danger`: từ chối, hủy hoặc xóa.
- `warning`: yêu cầu chỉnh sửa hoặc cảnh báo.
- `secondary`: thao tác phụ.
- `ghost`: thao tác chrome như đóng hoặc bỏ chọn.
