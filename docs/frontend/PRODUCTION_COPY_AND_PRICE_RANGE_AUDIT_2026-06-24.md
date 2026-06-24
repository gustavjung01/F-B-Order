# Audit nội dung hiển thị và khoảng giá sản phẩm

Ngày audit: 2026-06-24

## Phạm vi

- Danh mục sản phẩm mobile và desktop.
- Cửa sổ chọn phân loại.
- Bộ lọc sản phẩm.
- Giỏ hàng.
- Đăng ký khách hàng và trạng thái đăng nhập.
- Trang khuyến mãi và công thức.

## Các nhóm nội dung không phù hợp production

1. Thuật ngữ triển khai nội bộ xuất hiện với khách hàng: `Catalog v2`, `variant_id`, `backend`, `checkout variant`, `order v2`.
2. Cách mô tả cấu trúc dữ liệu thay cho lợi ích khách hàng: `Một card = một sản phẩm cha`, `Một sản phẩm cha · nhiều biến thể`, `2 card / hàng`.
3. Nội dung thử nghiệm hoặc placeholder: `Đang phát triển`, `Tính năng đang được phát triển`, `Chưa có công thức active`.
4. Nội dung tài khoản thiếu dấu và dùng tên hệ thống nội bộ: `Clerk`, `admin`, `Ho so quan`, `Mo khoa gia si`.
5. Số lượng sản phẩm hardcode cũ: `Xem 188 sản phẩm`.

## Quy tắc nội dung đã áp dụng

- Dùng ngôn ngữ khách hàng: sản phẩm, phân loại, quy cách, mã sản phẩm, giá đại lý.
- Không hiển thị tên schema, phiên bản API, tên nền tảng xác thực hoặc tên giai đoạn kỹ thuật.
- Trạng thái chưa có dữ liệu phải mô tả trung tính, không dùng câu demo hoặc ghi chú phát triển.
- Văn bản tiếng Việt có dấu đầy đủ.
- Số lượng sản phẩm lấy từ dữ liệu thực tế, không hardcode.

## Quy tắc giá trên card danh mục

- Một phân loại hoặc các phân loại cùng giá: hiển thị một giá.
- Nhiều phân loại có giá khác nhau: hiển thị `giá thấp nhất – giá cao nhất`.
- Sản phẩm thời giá: giữ nhãn `Thời giá`.
- Trong chi tiết sản phẩm, mỗi phân loại vẫn hiển thị đúng giá riêng.

Ví dụ Siro Mama Gold:

- 700 ml: 53.000 ₫.
- 2 L: 140.000 ₫.
- Card danh mục: 53.000 ₫ – 140.000 ₫.

## Kiểm soát kỹ thuật

API danh sách trả thêm:

- `variantCount`
- `priceMin`
- `priceMax`

Khoảng giá được tính từ toàn bộ phân loại đang hoạt động của cùng sản phẩm, kể cả khi kết quả tìm kiếm chỉ khớp một phân loại.
